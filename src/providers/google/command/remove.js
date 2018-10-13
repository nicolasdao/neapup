/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const path = require('path')
const gcp = require('../gcp')
const utils = require('../utils')
const { bold, wait, error, promptList, askQuestion, question, success, displayTable, info } = require('../../../utils/console')
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
					{ name: ' 6. Service Account Key', value: 'service-account-key' },
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
								return askQuestion(question(`Are you sure you want to delete project ${bold(projectId)} (Y/n) ? `)).then(yes => {
									if (yes == 'n')
										return
									
									waitDone = wait(`Deleting project ${bold(projectId)}`)
									const startDel = Date.now()
									return gcp.project.delete(projectId, token, merge(options, { confirm: true, verbose: false }))
										.then(() => {
											waitDone()
											console.log(success(`Project ${bold(projectId)} successfully deleted in ${((Date.now() - startDel)/1000).toFixed(2)} seconds`))
										})
										.catch(e => {
											waitDone()
											const er = JSON.parse(e.message)
											if (er.code == 403 && er.message && er.message.indexOf('not authorized') >= 0)
												console.log(error('Permission to delete denied. You don\'t have enough access privileges to perform this action.'))
											else
												throw e
										})
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
												return askQuestion(question(`Are you sure you want to delete service ${bold(service)} from project ${bold(projectId)} (Y/n) ? `)).then(yes => {
													if (yes == 'n')
														return
													
													waitDone = wait(`Deleting service ${bold(service)} in project ${bold(projectId)}`)
													const startDel = Date.now()
													return gcp.app.service.delete(projectId, service, token, merge(options, { confirm: true }))
														.then(() => {
															waitDone()
															console.log(success(`Service ${bold(service)} in project ${bold(projectId)} successfully deleted in ${((Date.now() - startDel)/1000).toFixed(2)} seconds`))
														})
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
					else if (answer == 'service-account-key') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting service accounts for project ${bold(projectId)}`)
								return gcp.project.serviceAccount.list(projectId, token, merge(options, { includeKeys: true })).then(({ data: svcAccounts }) => {
									waitDone()
									const title = `Service Accounts For Project ${projectId}`
									console.log(`\nService Accounts For Project ${bold(projectId)}`)
									console.log(collection.seed(title.length).map(() => '=').join(''))
									console.log(' ')
									const svcAccountsWithRoles = (svcAccounts || []).filter(a => a.roles && a.roles.length > 0)
									if (svcAccountsWithRoles.length == 0)
										console.log('   No Service Accounts found\n')
									else {
										displayTable(svcAccountsWithRoles.reduce((acc, a, idx) => {
											const [ role_01, ...roles ] = a.roles
											const [ key_01, ...keys ] = a.keys
											const rolesAndKeys = collection.merge(roles, keys)
											const rCount = rolesAndKeys[0].length
											acc.push({
												' #': `${rCount > 0 ? '-' : '+'}${idx + 1}`, // a '+' means we should add a separator 
												name: a.displayName,
												accountId: a.email.split('@')[0],
												roles: role_01.replace('roles/', ''),
												'keys & their creation date': key_01 ? `01. ${key_01.id.slice(0,7)}...   ${key_01.created}` : 'No keys'
											})
											rolesAndKeys[0].forEach((r, idx) => acc.push({
												' #': `${idx+1 < rCount ? '-' : '+'}`, // a '+' means we should add a separator 
												name: '',
												accountId: '',
												roles: (rolesAndKeys[0][idx] || '').replace('roles/', ''),
												'keys & their creation date': rolesAndKeys[1][idx] ? `${idx+2 < 10 ? `0${idx+2}` : idx+2}. ${rolesAndKeys[1][idx].id.slice(0,7)}...   ${rolesAndKeys[1][idx].created}` : '',
											}))
											return acc
										}, []), { 
											indent: '   ', 
											line: cells => cells[0].trim().match(/^\+/), 
											format: cell => {
												const rm = ((cell || '').match(/^\s*(\+|-)/) || [])[0]
												if (rm) {
													const r = rm.replace(/(-|\+)/, ' ')
													return cell.replace(rm, r)
												}
												else
													return cell
											}
										})
										console.log(' ')

										const keysOptions = svcAccountsWithRoles.reduce((acc, a) => {
											const header = `${a.displayName} - ${a.email.split('@')[0]}`
											if (a.keys && a.keys.length) {
												const l = acc.length
												acc.push(...a.keys.map(({ id }, idx) => ({ name: ` ${bold(l+idx+1)}. ${header} - ${id}`, value: l+idx, email: a.email, id })))
											}
											return acc
										}, [])

										return promptList({ message: 'Which private key do you want to delete? ', choices: keysOptions, separator: false }).then(answer => {
											if (answer >= 0) {
												const { email, id } = keysOptions.find(x => x.value == answer)
												waitDone = wait(`Deleting private key ${bold(id)} in project ${bold(projectId)}...`)
												return gcp.project.serviceAccount.key.delete(projectId, email, id, token, options)
													.then(() => {
														waitDone()
														console.log(success('Private key successfully deleted'))
														console.log(' ')
													})
													.catch(e => {
														waitDone()
														const er = JSON.parse(e.message)
														if (er.code == 400 && er.message && er.message.toLowerCase().indexOf('request contains an invalid argument') >= 0) {
															console.log(error('Oops, it seems that this key is already inactive.'))
															console.log(info('This is a problem we\'re aware of and we\'re working on fixing it.'))
															console.log(info('Thanks a lot for your patience. We love you!'))
														} else 
															throw e
													})
											}
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




