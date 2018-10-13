/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const gcp = require('../gcp')
const { wait, error, bold, gray, promptList, success, askQuestion, question } = require('../../../utils/console')
const utils = require('../utils')
const { obj: { merge } } = require('../../../utils')

const clean = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true })).then(({ token }) => {
	let waitDone = wait('Getting all projects')
	return gcp.project.list(token, options)
		.then(({ data }) => {
			waitDone()
			const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
			if (activeProjects.length == 0) {
				console.log('No projects in this account')
				process.exit()
			} else {
				const projectLabel = activeProjects.length > 1 ? 'projects' : 'project'
				console.log((`${bold(activeProjects.length)} ACTIVE ${projectLabel} found`))
				waitDone = wait('Getting all services')
				return Promise.all(
					activeProjects.map(p => gcp.app.service.list(p.projectId, token, merge(options, { verbose: false, includeVersions: true }))
						.then(({ data }) => ({
							id: p.projectId,
							services: data
						}))
						.catch(() => {
							return null
						})))
					.then(values => {
						waitDone()
						const projectsServingWithServices = values
							.filter(x => x && x.services && x.services.length > 0)
							.map(p => {
								const services = p.services.map(s => {
									const versions = (s.versions || []).map(v => {
										v.isFlex = v.env && v.env != 'standard'
										v.autoScalingHasServingMinInstances = v.automaticScaling && (v.automaticScaling.minIdleInstances > 0 || (v.automaticScaling.standardSchedulerSettings && v.automaticScaling.standardSchedulerSettings.minInstances > 0))
										v.isServingBasicScaling = v.basicScaling
										v.isServingManualScaling = v.manualScaling
										v.isLeaking = v.servingStatus == 'SERVING' && !v.traffic && (v.isFlex || v.autoScalingHasServingMinInstances || v.isServingBasicScaling || v.isServingManualScaling)
										v.leakingReason = 
											v.isFlex ? { msg: 'Flexible Versions With No Traffic But Still Serving', id: 1 } :
												v.autoScalingHasServingMinInstances ? { msg: 'Auto-scaling Versions With No Traffic But With Min. Instances > 0', id: 2 } : 
													v.isServingBasicScaling ? { msg: 'Basic-scaling Versions With No Traffic But Still Serving', id: 3 } :
														v.isServingManualScaling ? { msg: 'Manual-scaling Versions With No Traffic But Still Serving', id: 4 } : null

										return v
									})
									const activeVersions = versions.filter(v => v.traffic > 0 && v.servingStatus == 'SERVING') // i.e., the ones which are being used to serve traffic
									const leakingVersions = versions.filter(v => v.isLeaking) // i.e., the ones which are burning cash though they are not being used
									const harmlessInactiveVersions = versions.filter(v => !v.traffic && !v.isLeaking) // i.e., the ones which are not burning cash though they are not being used
									const isLeaking = leakingVersions.length > 0
									
									return {
										id: s.id,
										activeVersions,
										leakingVersions,
										harmlessInactiveVersions,
										versionsCount: versions.length,
										isLeaking
									}
								})
								return {
									id: p.id,
									services
								}
							})

						if (projectsServingWithServices.length == 0) {
							console.log((`No service found for any of the ${activeProjects.length} ${projectLabel} currently active.`))
							process.exit()
						} else {
							const leakingProjects = projectsServingWithServices.filter(p => p.services.some(s => s.isLeaking))
							const accountLeaking = leakingProjects.length
							const pLabel = accountLeaking > 1 ? 'projects' : 'project'
							if (accountLeaking) {
								const indent = '   '
								console.log(bold(`${accountLeaking} LEAKING ${pLabel} found:`))
								console.log(gray('Note: A leaking project is one that still incurs costs and keep eating into your quotas even though it has stopped serving traffic'))
								leakingProjects.forEach((p, idx) => {
									console.log(`\n${bold(idx+1)}. ${bold(p.id)} - Services:`)
									p.services.filter(s => s.isLeaking).forEach(s => {
										const serviceName = s.id 
										const activeVersionsCount = s.activeVersions.length
										const harmlessInactiveVersionsCount = s.harmlessInactiveVersions.length
										const leakingVersionsCount = s.leakingVersions.length
										const leakingReasonCount_01 = s.leakingVersions.filter(x => x.leakingReason && x.leakingReason.id == 1).length
										const leakingReasonCount_02 = s.leakingVersions.filter(x => x.leakingReason && x.leakingReason.id == 2).length
										const leakingReasonCount_03 = s.leakingVersions.filter(x => x.leakingReason && x.leakingReason.id == 3).length
										const leakingReasonCount_04 = s.leakingVersions.filter(x => x.leakingReason && x.leakingReason.id == 4).length

										console.log(`${indent}  ${bold(serviceName)} - Versions Stats:`)
										console.log(`${indent}${indent}- Total: ${bold(s.versionsCount)}`)
										console.log(`${indent}${indent}- Live: ${bold(activeVersionsCount)}`)
										console.log(`${indent}${indent}- Idle but harmless: ${bold(harmlessInactiveVersionsCount)}`)
										console.log(`${indent}${indent}- Idle and leaking: ${bold(leakingVersionsCount)}`)
										console.log(`${indent}${indent}${indent}- Flexible - Should be stopped: ${bold(leakingReasonCount_01)}`)
										console.log(`${indent}${indent}${indent}- Auto-scaling with min. instances running - Min. instances should be set to 0: ${bold(leakingReasonCount_02)}`)
										console.log(`${indent}${indent}${indent}- Basic-scaling - Should be stopped: ${bold(leakingReasonCount_03)}`)
										console.log(`${indent}${indent}${indent}- Manual-scaling - Should be stopped: ${bold(leakingReasonCount_04)}`)
										console.log(' ')
									})
								})

								_showLegend()

								return promptList({ message: 'Next:', choices:[
									{ name: ' Fix leaking versions', value: 'fix' },
									{ name: 'Login to another Google Account', value: 'change', specialOps: true }], separator: false })
									.then(answer => {
										if (!answer)
											process.exit()
										if (answer == 'fix') {
											const choices = leakingProjects.reduce((acc,p) => {
												const leakingServices = p.services.filter(s => s.isLeaking)
												if (leakingServices.length > 0)
													acc.push(...leakingServices.map(s => ({ name: `${p.id} - ${s.id}`, value: `${p.id} - ${s.id}` })))
												return acc
											}, [])
											choices.push({ name: 'all', value: 'all' })

											const formattedChoices = choices.map((x, idx) => ({
												name: ` ${idx+1}. ${x.name}`,
												value: x.value
											}))

											return promptList({ message: 'Which leaking versions do you want to fix:', choices: formattedChoices, separator: false }).then(answer => {
												if (!answer)
													process.exit()

												let leakingVersions
												if (answer == 'all')
													leakingVersions = leakingProjects.reduce((acc,p) => {
														acc.push(...p.services.filter(s => s.isLeaking).reduce((a,s) => {
															a.push(...s.leakingVersions.map(v => ({ projectId: p.id, service: s.id, version: v.id })))
															return a
														}, []))
														return acc
													}, [])
												else {
													const parts = answer.split(' - ')
													const projectId = parts[0]
													const service = parts[1]
													leakingVersions = leakingProjects.filter(p => p.id == projectId).reduce((acc,p) => {
														acc.push(...p.services.filter(s => s.isLeaking && s.id == service).reduce((a,s) => {
															a.push(...s.leakingVersions.map(v => ({ projectId: p.id, service: s.id, version: v.id })))
															return a
														}, []))
														return acc
													}, [])
												}
												
												const leakingVersionLabel = leakingVersions.length > 0 ? 'versions' : 'version'
												waitDone = wait(`Fixing ${leakingVersions.length} leaking ${leakingVersionLabel}`)
												return Promise.all(leakingVersions.map(v => 
													gcp.app.service.version.minimizeBilling(v.projectId, v.service, v.version, token, merge(options, { confirm: true }))))
													.then(() => {
														waitDone()
														console.log(success(`Successfully fixed ${leakingVersions.length} ${leakingVersionLabel}`))
														process.exit()
													})
											})
										} else 
											return utils.account.choose(merge(options, { skipProjectSelection: true })).then(() => clean(options))
									})
							}
							else {
								console.log(('No projects seem to use idle billable resources. Nothing to clean.'))
								return askQuestion(question('Do you want to clean another Google Cloud Account (Y/n) ? ')).then(yes => {
									if (yes == 'n')
										process.exit()

									return utils.account.choose(merge(options, { skipProjectSelection: true })).then(() => clean(options))
								})
							}
							
						}
					})
			}
		})
		.catch(e => {
			console.log(error(e.message, e.stack))
		})	
})

const _showLegend = () => {
	console.log(gray(`\n${bold('LEGEND')}`))
	console.log(gray('======'))
	console.log(gray(`- ${bold('Live')}:     Live versions are versions that are currently serving traffic.`))
	console.log(gray(`- ${bold('Idle')}:     Idle versions are versions which are not serving traffic.`))
	console.log(gray(`- ${bold('Harmless')}: A version is considered harmless when its config is such that `))
	console.log(gray('            when it stops receiving traffic, it stops incurring costs, and stop consuming '))
	console.log(gray('            resources that could eat into your quotas. The only harmless configs are:'))
	console.log(gray('               - Standard versions in auto-scaling mode with no min. instances and no '))
	console.log(gray('                 min. idle instances.'))
	console.log(gray('               - STOPPED versions.'))
	console.log(gray(`- ${bold('Leaking')}:  A version is leaking when it still incurs costs and keep eating into your quotas`))
	console.log(gray('            even after it stops receiving traffic. Leaking versions\' status is still SERVING.'))
	console.log(gray('            There are 3 possible configs that are considered leaking:'))
	console.log(gray('               - Flexible versions'))
	console.log(gray('               - Auto-scaling versions with min. instances or min. idle instances'))
	console.log(gray('               - Basic or manual scaling versions\n'))
}

module.exports = clean




