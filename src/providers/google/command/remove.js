/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const path = require('path')
const gcp = require('../gcp')
const utils = require('../utils')
const { bold, wait, error, promptList, askQuestion, question, success, displayTable } = require('../../../utils/console')
const { obj: { merge }, file, collection } = require('../../../utils')
const projectHelper = require('../project')
const { chooseAProject } = require('./list')
const getToken = require('../getToken')

const removeStuffs = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true }))
	.then(({ token }) => {
		let waitDone = wait('Gathering information about your Google Cloud Account')
		return gcp.project.list(token, options)
			.then(({ data }) => {
				waitDone()
				const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
				const activeProjectIds = activeProjects.map(p => p.projectId)
				const topLevelChoices = [
					{ name: ' 1. Project', value: 'project' },
					{ name: ' 2. Service', value: 'service' },
					{ name: ' 3. Custom Domain', value: 'domain' },
					{ name: ' 4. Cron Job', value: 'cron' },
					{ name: ' 5. Task Queue', value: 'queue' },
					{ name: 'Login to another Google Account', value: 'account', specialOps: true }
				]

				options.projectPath = projectHelper.getFullPath(options.projectPath)

				return promptList({ message: (options.question || 'What do you want to delete?'), choices: topLevelChoices, separator: false }).then(answer => {
					if (!answer)
						process.exit()
					if (answer == 'project') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Deleting project ${bold(projectId)}`)
								const startDel = Date.now()
								return gcp.project.delete(projectId, token, merge(options, { confirm: true }))
									.then(() => {
										waitDone()
										console.log(success(`Project ${bold(projectId)} successfully deleted in ${((Date.now() - startDel)/1000).toFixed(2)} seconds`))
									})
							})
					else if (answer == 'service') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Listing services for project ${bold(projectId)}`)
								return gcp.app.service.list(projectId, token, merge(options, { verbose: false }))
									.then(({ data: services }) => {
										waitDone()
										if (!services || !services.length) {
											console.log('\n   No services found\n')
											return
										}

										const choices = services.map((svc, idx) => ({ name: ` ${bold(idx+1)}. ${bold(svc.id)}`, value: svc.id }))
										return promptList({ message: 'Which service do you want to delete?', choices, separator: false }).then(service => {
											if (service) {
												waitDone = wait(`Deleting service ${bold(service)} in project ${bold(projectId)}`)
												const startDel = Date.now()
												return gcp.app.service.delete(projectId, service, token, merge(options, { confirm: true }))
													.then(() => {
														waitDone()
														console.log(success(`Service ${bold(service)} in project ${bold(projectId)} successfully deleted in ${((Date.now() - startDel)/1000).toFixed(2)} seconds`))
													})
											}
										})
									})
							})
					else if (answer == 'cron') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting Cron config for project ${bold(projectId)}`)
								return gcp.app.cron.get(projectId, token, options)
									.then(({ data: cronJobs }) => {
										waitDone()
										const title = `Cron Jobs For Project ${projectId}`
										console.log(`\nCron Jobs For Project ${bold(projectId)}`)
										console.log(collection.seed(title.length).map(() => '=').join(''))
										console.log(' ')

										if (!cronJobs || cronJobs.length == 0) {
											console.log('   No Cron jobs found\n')
											return
										}
										else {
											displayTable(cronJobs.map((c, idx) => ({
												id: idx + 1,
												schedule: c.schedule,
												timezone: c.timezone,
												url: c.url,
												service: c.target,
												description: c.description,
												created: c.creationDate
											})), { indent: '   ' })
											console.log(' ')
											return _chooseId('Enter the Cron job ids you want to delete (ex: 1,2,3): ', cronJobs.map((c,idx) => idx + 1))
												.then(ids => {
													const itemsLeft = cronJobs.filter((c,idx) => !ids.some(id => id == (idx+1)))
													waitDone = wait(`Deleting ${ids.length} Cron job${ids.length == 1 ? '' : 's'}...`)
													return getToken(options)
														.then(token => gcp.app.cron.update(projectId, itemsLeft, token, options))
														.then(() => {
															waitDone()
															console.log(success(`${ids.length} Cron job${ids.length == 1 ? '' : 's'} successfully deleted to project ${projectId}`))
														})
												})
										}
									})
							})
					else if (answer == 'queue') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting Task Queue config for project ${bold(projectId)}`)
								return gcp.app.queue.get(projectId, token, options)
									.then(({ data: queues }) => {
										waitDone()
										const title = `Task Queues For Project ${projectId}`
										console.log(`\nTask Queues For Project ${bold(projectId)}`)
										console.log(collection.seed(title.length).map(() => '=').join(''))
										console.log(' ')

										if (!queues || queues.length == 0) {
											console.log('   No Task Queues found\n')
											return
										}
										else {
											displayTable(queues.map((c, idx) => ({
												id: idx + 1,
												name: c.name,
												service: c.target,
												rate: c.rate,
												'bucket size': c.bucketSize,
												'max concurrent requests': c.maxConcurrentRequests,
												created: c.creationDate
											})), { indent: '   ' })
											console.log(' ')
											return _chooseId('Enter the Task Queues ids you want to delete (ex: 1,2,3): ', queues.map((c,idx) => idx + 1))
												.then(ids => {
													const itemsLeft = queues.filter((c,idx) => !ids.some(id => id == (idx+1)))
													waitDone = wait(`Deleting ${ids.length} Task Queue${ids.length == 1 ? '' : 's'}...`)
													return getToken(options)
														.then(token => gcp.app.queue.update(projectId, itemsLeft, token, options))
														.then(() => {
															waitDone()
															console.log(success(`${ids.length} Task Queue${ids.length == 1 ? '' : 's'} successfully deleted to project ${projectId}`))
														})
												})
										}
									})
							})
					else if (answer == 'account')
						return utils.account.choose(merge(options, { skipProjectSelection: true, skipAppEngineCheck: true })).then(() => removeStuffs(options))
					else
						throw new Error('Oops!!! This is not supported yet')
				})
			}).catch(e => {
				waitDone()
				console.log(error('Failed to list services', e.message, e.stack))
				throw e
			})
	})
	.then(() => removeStuffs(merge(options, { question: 'What else do you want to delete?' })))

const _chooseId = (q, choices) => askQuestion(question(q))
	.then(answer => {
		choices = choices || []
		const ids = (answer || '').split(',').map(x => x.trim()*1).filter(x => x)
		const invalidIds = ids.filter(id => !choices.some(c => c == id))
		if (!answer) {
			console.log(error('You must enter at least one id'))
			return _chooseId(q, choices)
		} else if (invalidIds.length > 0) {
			const [ idLabel, verbLabel ] = invalidIds.length == 1 ? [ 'id', 'doesn\'t' ] : [ 'ids', 'don\'t' ]
			console.log(error(`The ${idLabel} ${bold(invalidIds.join(','))} ${verbLabel} exist`))
			return _chooseId(q, choices)
		} else 
			return ids
	})

const _getAppJsonFiles = (options={}) => file.getJsonFiles(options.projectPath, options)
	.catch(() => [])
	.then(jsonFiles => jsonFiles.map(x => path.basename(x)).filter(x => x.match(/^app\./) && (x.split('.').length == 3 || x.split('.').length == 2)))


module.exports = removeStuffs




