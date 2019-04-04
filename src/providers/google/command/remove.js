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
const { bold, wait, error, promptList, askQuestion, question, success, displayTable, info, searchAnswer } = require('../../../utils/console')
const { obj: { merge }, file, collection } = require('../../../utils')
const projectHelper = require('../project')
const { chooseAProject } = require('./list')
const getToken = require('../getToken')
const { bucketHelper } = require('../helpers')

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
					{ name: ' 6. Bucket', value: 'bucket' },
					{ name: ' 7. BigQuery', value: 'bigquery' },
					{ name: ' 8. Access', value: 'access' },
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
					else if (answer == 'bucket') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Loading Buckets info from project ${bold(projectId)}`)
								return gcp.bucket.list(projectId, token, options).then(({ data: buckets }) => {
									waitDone()
									const title = `Buckets In Project ${projectId}`
									console.log(`\nBuckets In Project ${bold(projectId)}`)
									console.log(collection.seed(title.length).map(() => '=').join(''))
									console.log(' ')
									if (!buckets || buckets.length == 0) {
										console.log('   No Buckets found\n')
										return
									}
									else {
										const nowDeployments = buckets.filter(b => b.id.indexOf('now-deployments-') == 0) // legacy
										const webfuncDeployments = buckets.filter(b => b.id.indexOf('webfunc-deployment-') == 0) // legacy
										const neapupDeployments = buckets.filter(b => b.id.indexOf('neapup-v') == 0)
										const normalBuckets = buckets.filter(b => {
											return b.id.indexOf('now-deployments-') != 0
											&& b.id.indexOf('webfunc-deployment-') != 0
											&& b.id.indexOf('neapup-v') != 0
										})
										if (nowDeployments.length > 0) {
											let lastDeployment = nowDeployments.slice(-1)[0]
											lastDeployment.id = 'now-deployments-xxx'
											lastDeployment.deploymentsCount = nowDeployments.length
											normalBuckets.push(lastDeployment)
										}
										if (webfuncDeployments.length > 0) {
											let lastDeployment = webfuncDeployments.slice(-1)[0]
											lastDeployment.id = 'webfunc-deployments-YYYYMMDD-hhmmss-xxxxxxxxx'
											lastDeployment.deploymentsCount = webfuncDeployments.length
											normalBuckets.push(lastDeployment)
										}
										if (neapupDeployments.length > 0) {
											let lastDeployment = neapupDeployments.slice(-1)[0]
											lastDeployment.id = 'neapup-vYYYYMMDD-hhmmss-x'
											lastDeployment.deploymentsCount = neapupDeployments.length
											normalBuckets.push(lastDeployment)
										}
										displayTable(normalBuckets.map((c, idx) => ({
											id: idx + 1,
											name: c.id,
											location: c.location,
											type: c.storageClass, 
											created: c.timeCreated,
											updated: c.updated,
											'total similar': c.deploymentsCount || 'N.A.' 
										})), { indent: '   ' })
									}
									console.log(' ')

									// const choices = buckets.filter(({ id }) => !id.match(/^(neapup-v|now-deployments-|webfunc-deployment-)/)).map(({ id },idx) => ({ name: ` ${idx+1}. ${id}`, value: id }))
									const choices = buckets.filter(({ id }) => !id.match(/^(neapup-v|now-deployments-|webfunc-deployment-)/)).map(({ id }) => id)
									if (!choices.some(x => x)) {
										console.log(info('No buckets can be deleted. The only existing buckets are restricted system buckets that are necessary to operate your account. They cannot be deleted.'))
										return
									}

									return searchAnswer('Select a bucket ID: ', choices, (input='', rs) => rs.filter(r => r && r.toLowerCase().indexOf(input.toLowerCase().trim()) >= 0)).then(answer => {
									//return promptList({ message: 'Choose which bucket you want to delete:', choices, separator: false }).then(answer => {
										if (!answer)
											return
										return askQuestion(question(`Are you sure you want to delete bucket ${bold(answer)} in project ${bold(projectId)} (Y/n) ? `)).then(yes => {
											if (yes == 'n')
												return

											waitDone = wait('Deleting bucket')
											return bucketHelper.delete({ projectId, bucketId:answer, token }).then(() => {// gcp.bucket.delete(answer, token, options).then(() => {
												waitDone()
												console.log(success(`Bucket ${bold(answer)} successfully deleted from project ${bold(projectId)}`))
											})
										})
									})
								})
							})
					else if (answer == 'bigquery') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Loading BigQuery databases info in project ${bold(projectId)}`)
								return gcp.bigQuery.list(projectId, token, options).then(({ data: dbs }) => {
									waitDone()
									const title = `BiqQuery Databases In Project ${projectId}`
									console.log(`\nBiqQuery Databases In Project ${bold(projectId)}`)
									console.log(collection.seed(title.length).map(() => '=').join(''))
									console.log(' ')
									if (!dbs || dbs.length == 0) {
										console.log('   No Databases found\n')
										console.log(' ')
										return
									}

									displayTable(dbs.map((c,idx) => ({
										id: idx + 1,
										name: c.id.split(':').slice(-1)[0],
										location: c.location
									})), { indent: '   ' })
									console.log(' ')

									const choices = [
										{ name: ' 1. DB', value: 'db' },
										{ name: ' 2. DB Table', value: 'table' }
									]
									return promptList({ message: 'What do you want to delete? ', choices, separator: false }).then(answer => {
										if (!answer)
											return
										else if (answer == 'db') {
											const choices = dbs.map((db,idx) => ({ name: ` ${idx+1}. ${db.id.split(':').slice(-1)[0]}`, value: db.id.split(':').slice(-1)[0] }))
											return promptList({ message: 'Select the DB you want to delete:', choices, separator: false }).then(dbName => {
												if (!dbName)
													return

												return askQuestion(question(`Are you sure you want to delete the ${bold(dbName)} BigQuery DB from project ${bold(projectId)} (Y/n) ? `)).then(yes => {
													if (yes == 'n')
														return
													
													waitDone = wait('Deleting BigQuery DB')
													return gcp.bigQuery.delete(projectId, dbName, token, options).then(() => {
														waitDone()
														console.log(success(`BigQuery DB ${bold(dbName)} successfully deleted from project ${bold(projectId)}`))
													})
												})
											})
										} else {
											const choices = dbs.map((db,idx) => ({ name: ` ${bold(idx+1)}. ${bold(db.id.split(':').slice(-1)[0])}`, value: db.id.split(':').slice(-1)[0] }))
											return promptList({ message: 'Select a DB:', choices, separator: false }).then(answer => {
												if (!answer)
													return 
												waitDone = wait(`Loading all tables in DB ${bold(answer)} in project ${bold(projectId)}`)
												return gcp.bigQuery.table.list(projectId, answer, token, options).then(({ data }) => {
													waitDone()
													const title = `Tables In DB ${answer} In Project ${projectId}`
													console.log(`\nTables In DB ${bold(answer)} In Project ${bold(projectId)}`)
													console.log(collection.seed(title.length).map(() => '=').join(''))
													console.log(' ')
													if (data.length == 0)
														console.log('   No Tables found\n')
													else
														displayTable(data.map((c,idx) => ({
															id: idx + 1,
															name: c.id.split('.').slice(-1)[0],
															created: (new Date(c.creationTime * 1)).toString()
														})), { indent: '   ' })
													
													console.log(' ')
													
													const choices = data.map(({ id },idx) => ({ name: ` ${idx+1}. ${id.split('.').slice(-1)[0]}`, value: id.split('.').slice(-1)[0] }))
													return promptList({ message: 'Which table do you want to delete?', choices, separator: false }).then(tableName => {
														if (!tableName)
															return

														return askQuestion(question(`Are you sure you want to delete table ${bold(tableName)} in DB ${bold(answer)} from project ${bold(projectId)} (Y/n) ? `)).then(yes => {
															if (yes == 'n')
																return
															
															waitDone = wait('Deleting BigQuery table')
															return gcp.bigQuery.table.delete(projectId, answer, tableName, token, options).then(() => {
																waitDone()
																console.log(success(`BigQuery table ${bold(tableName)} successfully delete from DB ${bold(answer)} in project ${bold(projectId)}`))
															})
														}) 
													})
												})

											})
										}
									})
								})
							})
					else if (answer == 'access') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, removeStuffs, options))
							.then(({ projectId, token }) => {
								const choices = [
									{ name: `I want to decrease/remove access of a ${bold('Collaborator')} to limit how he/she manages my Cloud`, value: 'user' },
									{ name: `I want to decrease/remove access of an ${bold('Agent')} to limit how it uses my Cloud (e.g., adding files to my Storage)`, value: 'agent' }
								]

								return promptList({ message: 'What type of access do you want to change? ', choices, separator: false }).then(answer => {
									return { projectId, token, choice: answer }
								})
							})
							.then(({ projectId, token, choice }) => {
								if (!choice)
									return
								else if (choice == 'user')
									return _manageUsers(projectId, token, waitDone, options)
								else 
									return _manageServiceAccount(projectId, token, waitDone, options)
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

const _manageUsers = (projectId, token, waitDone, options) => Promise.resolve(null).then(() => {
	waitDone = wait(`Listing Collaborators for project ${bold(projectId)}`)
	return gcp.project.user.list(projectId, token, options)
		.then(({ data }) => {
			waitDone()
			const title = `Collaborators For Project ${projectId}`
			console.log(`\nCollaborators For Project ${bold(projectId)}`)
			console.log(collection.seed(title.length).map(() => '=').join(''))
			console.log(' ')
			data = data || []
			if (data.length == 0)
				console.log('   No Collaborators found\n')
			else {
				displayTable(data.reduce((acc, a, idx) => {
					const [ role_01='', ...roles ] = a.roles || []
					const rCount = roles.length
					acc.push({
						' #': `${rCount > 0 ? '-' : '+'}${idx + 1}`, // a '+' means we should add a separator 
						name: a.user,
						roles: role_01.replace('roles/', '') || 'No roles'
					})
					roles.forEach((r, idx) => acc.push({
						' #': `${idx+1 < rCount ? '-' : '+'}`, // a '+' means we should add a separator 
						name: '',
						roles: (roles[idx] || '').replace('roles/', '')
					}))
					return acc
				}, []), { // All the following is to gronk an array 
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
				console.log('\n')

				const choices = data.map(d => ({ name: d.user, value: d.user }))
				return promptList({ message: 'Which Collaborator do you want to remove?', choices, separator: false }).then(answer => {
					if (!answer)
						return 
					return askQuestion(question(`Are you sure you want to remove ${bold(answer)} as a Collaborators (Y/n) ? `)).then(yes => {
						if (yes == 'n')
							return		

						waitDone = wait(`Removing a new Collaborator to project ${bold(projectId)}...`)
						return gcp.project.user.delete(projectId, answer, token, options)
							.then(() => {
								waitDone()
								console.log(success(`New Collaborator successfully removed from project ${bold(projectId)}\n`))
							})
					})
				})
			}
		})
})

const _manageServiceAccount = (projectId, token, waitDone, options) => _listServiceAccount(projectId, token, waitDone, options).then(svcAccounts => {
	if (!svcAccounts)
		return 

	const choices = [
		{ name: 'Remove a service account', value: 'account' },
		{ name: 'Remove roles from a service account', value: 'role' },
		{ name: 'Disable a service account JSON key', value: 'key' }
	]

	return promptList({ message: 'What do want to do: ', choices, separator: false }).then(answer => {
		return { projectId, token, choice: answer }
	})
		.then(({ projectId, token, choice }) => {
			if (!choice)
				return null

			if (choice == 'key')
				return _removeJsonKeyToServiceAccount(projectId, token, waitDone, svcAccounts, options)
			else if (choice == 'role') 
				return _removeRolesToServiceAccount(projectId, token, waitDone, svcAccounts, options)
			else
				return _removeServiceAccount(projectId, token, waitDone, svcAccounts, options)
		})
})

const _removeServiceAccount = (projectId, token, waitDone, svcAccounts, options) => Promise.resolve(null).then(() => {
	if (!svcAccounts)
		return 
	
	const keyOptions = svcAccounts.map((a,idx) => ({
		name: ` ${bold(idx+1)}. ${a.displayName} - ${a.email.split('@')[0]}`, value: idx
	}))

	return promptList({ message: 'Which service account do you want to delete? ', choices: keyOptions, separator: false }).then(answer => {
		if (answer >= 0) {
			const v = svcAccounts[answer*1]
			return v.email
		} 
		return false 
	}).then(email => {
		if (email) {
			return askQuestion(question(`Are you sure you want to delete service account ${bold(email)} (Y/n) ? `)).then(yes => {
				if (yes == 'n')
					return						
				
				waitDone = wait(`Deleting service account ${bold(email)} from project ${bold(projectId)}`)
				return gcp.project.serviceAccount.delete(projectId, email, token, options).then(() => {
					waitDone()
					console.log(success(`Service account ${bold(email)} successfully deleted from project ${bold(projectId)}`))
				})
			})
		}
	})
})

const _removeRolesToServiceAccount = (projectId, token, waitDone, svcAccounts, options) => Promise.resolve(null).then(() => {
	if (!svcAccounts)
		return 

	const keyOptions = svcAccounts.map((a,idx) => ({
		name: ` ${bold(idx+1)}. ${a.displayName} - ${a.email.split('@')[0]}`, value: idx
	}))

	let serviceAccountEmail
	return promptList({ message: 'Remove roles from one of the following service accounts: ', choices: keyOptions, separator: false }).then(answer => {
		if (answer >= 0) {
			const v = svcAccounts[answer*1]
			serviceAccountEmail = v.email
			if (!v.roles || v.roles.length == 0) {
				console.log(info('The service account you\'ve choosen has no roles'))
				return false
			}
			return _chooseAccountRoles(v.roles, { required: true })
		}
		return false 
	}).then(roles => {
		if (roles) {
			return askQuestion(question(`Are you sure you want to remove ${roles.length} role${roles.length > 1 ? 's' : ''} (Y/n) ? `)).then(yes => {
				if (yes == 'n')
					return						
				
				waitDone = wait(`Removing roles from ${bold(serviceAccountEmail)} in project ${bold(projectId)}`)
				return gcp.project.serviceAccount.roles.delete(projectId, serviceAccountEmail, roles, token, options).then(() => {
					waitDone()
					console.log(success(`Roles successfully removed from ${bold(serviceAccountEmail)} in project ${bold(projectId)}`))
				})
			})
		}
	})
})

const _removeJsonKeyToServiceAccount = (projectId, token, waitDone, svcAccounts, options) => Promise.resolve(null).then(() => {
	if (!svcAccounts)
		return 
	
	const keysOptions = svcAccounts.reduce((acc, a) => {
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
})

const _listServiceAccount = (projectId, token, waitDone, options) => Promise.resolve(null).then(() => {
	waitDone = wait(`Getting service accounts for project ${bold(projectId)}`)
	return gcp.project.serviceAccount.list(projectId, token, merge(options, { includeKeys: true })).then(({ data: svcAccounts }) => {
		waitDone()
		const title = `Service Accounts For Project ${projectId}`
		console.log(`\nService Accounts For Project ${bold(projectId)}`)
		console.log(collection.seed(title.length).map(() => '=').join(''))
		console.log(' ')
		svcAccounts = svcAccounts || []
		if (svcAccounts.length == 0)
			console.log('   No Service Accounts found\n')
		else {
			displayTable(svcAccounts.reduce((acc, a, idx) => {
				const [ role_01='', ...roles ] = a.roles || []
				const [ key_01='', ...keys ] = a.keys || []
				const rolesAndKeys = collection.merge(roles, keys)
				const rCount = rolesAndKeys[0].length
				acc.push({
					' #': `${rCount > 0 ? '-' : '+'}${idx + 1}`, // a '+' means we should add a separator 
					name: a.displayName,
					accountId: a.email.split('@')[0],
					roles: role_01.replace('roles/', '') || 'No roles',
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
			}, []), { // All the following is to gronk an array 
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
			return svcAccounts
		}
	})
})

/**
 * [description]
 * @param  {Boolean} options.required 	[description]
 * @return {[type]}         			[description]
 */
const _chooseAccountRoles = (roles, options={}) => {
	const answers = []
	return searchAnswer('Select a roles: ', (roles || []).map(r => r.replace('roles/', '')), (input='', rs) => rs.filter(r => r && r.toLowerCase().indexOf(input.toLowerCase().trim()) >= 0)).then(answer => {
		if (answer)
			answers.push(`roles/${answer}`)

		return askQuestion(question('Do you want to add another role (Y/n) ? ')).then(yes => {
			if (yes == 'n') {
				if (options.required && answers.length == 0)
					console.log(error('You must add at least one role to continue'))
				else
					return answers
			}
			return _chooseAccountRoles(roles.filter(r => !answers.some(a => a == r)), options).then(otherRoles => {
				const totals = [...answers, ...(otherRoles || [])]
				return collection.uniq(totals)
			})
		})
	})
}

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




