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
const { bold, gray, wait, error, promptList, warn, info, link, displayTable } = require('../../../utils/console')
const { collection, obj: { merge }, file } = require('../../../utils')
const projectHelper = require('../project')
const { hosting: hostingHelper } = require('../config')

const listStuffs = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true }))
	.then(({ token }) => {
		let waitDone = wait('Gathering information about your Google Cloud Account')
		return gcp.project.list(token, options)
			.then(({ data }) => {
				waitDone()
				const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
				const activeProjectIds = activeProjects.map(p => p.projectId)
				const topLevelChoices = [
					{ name: ' 1. Projects', value: 'projects' },
					{ name: ' 2. Services', value: 'services' },
					{ name: ' 3. Custom Domains', value: 'domains' },
					{ name: ' 4. Cron Jobs', value: 'cron' },
					{ name: ' 5. Task Queues', value: 'queue' },
					{ name: ' 6. Buckets', value: 'bucket' },
					{ name: ' 7. BigQuery', value: 'bigquery' },
					{ name: ' 8. Accesses', value: 'access' },
					{ name: 'Login to another Google Account', value: 'account', specialOps: true }
				]

				options.projectPath = projectHelper.getFullPath(options.projectPath)

				return promptList({ message: (options.question || 'What do you want to list? '), choices: topLevelChoices, separator: false }).then(answer => {
					if (!answer)
						process.exit()
					if (answer == 'services') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
							.then(({ projectId, token }) => listProjectServices(projectId, token, options))
					else if (answer == 'cron') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting Cron config for project ${bold(projectId)}`)
								return gcp.app.cron.get(projectId, token, options).then(({ data: cronJobs }) => {
									waitDone()
									const title = `Cron Jobs For Project ${projectId}`
									console.log(`\nCron Jobs For Project ${bold(projectId)}`)
									console.log(collection.seed(title.length).map(() => '=').join(''))
									console.log(' ')
									if (!cronJobs || cronJobs.length == 0)
										console.log('   No Cron jobs found\n')
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
									}
								})
							})
					else if (answer == 'queue') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting Task Queue config for project ${bold(projectId)}`)
								return gcp.app.queue.get(projectId, token, options).then(({ data: queues }) => {
									waitDone()
									const title = `Task Queues In Project ${projectId}`
									console.log(`\nTask Queues In Project ${bold(projectId)}`)
									console.log(collection.seed(title.length).map(() => '=').join(''))
									console.log(' ')
									if (!queues || queues.length == 0)
										console.log('   No Task Queues found\n')
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
									}
								})
							})
					else if (answer == 'account')
						return utils.account.choose(merge(options, { skipProjectSelection: true, skipAppEngineCheck: true })).then(() => listStuffs(options))
					else if (answer == 'domains') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
							.then(({ projectId, token }) => listProjectDomains(projectId, token, options))
					else if (answer == 'access') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
							.then(({ projectId, token }) => {
								const choices = [
									{ name: `The ${bold('Collaborators')} helping me to manage my Cloud`, value: 'user' },
									{ name: `The ${bold('Agents')} using my Cloud (e.g., adding files to storage)`, value: 'agent' }
								]
								return promptList({ message: 'What do you want to list? ', choices, separator: false }).then(choice => ({ projectId, token, choice }))
							})
							.then(({ projectId, token, choice }) => {
								if (!choice)
									return 
								else if (choice == 'user') {
									waitDone = wait(`Listing Collaborators for project ${bold(projectId)}`)
									return gcp.project.user.list(projectId, token, options)
										.then(({ data }) => {
											waitDone()
											const title = `Collaborators In Project ${projectId}`
											console.log(`\nCollaborators In Project ${bold(projectId)}`)
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
											}
										})
								} else {
									waitDone = wait(`Getting service accounts for project ${bold(projectId)}`)
									return gcp.project.serviceAccount.list(projectId, token, merge(options, { includeKeys: true })).then(({ data: svcAccounts }) => {
										waitDone()
										const title = `Service Accounts In Project ${projectId}`
										console.log(`\nService Accounts In Project ${bold(projectId)}`)
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
										}
									})
								}
							})
					else if (answer == 'bigquery') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
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

									const choices = dbs.map((db,idx) => ({ name: ` ${bold(idx+1)}. ${bold(db.id.split(':').slice(-1)[0])}`, value: db.id.split(':').slice(-1)[0] }))
									return promptList({ message: 'Select a DB to list its tables:', choices, separator: false }).then(answer => {
										if (!answer)
											return 
										waitDone = wait(`Loading all tables in DB ${bold(answer)} in project ${bold(projectId)}`)
										return gcp.bigQuery.table.list(projectId, answer, token, options).then(({ data }) => {
											waitDone()
											const title = `Tables In DB ${answer} In Project ${projectId}`
											console.log(`\nTables In DB ${bold(answer)} In Project ${bold(projectId)}`)
											console.log(collection.seed(title.length).map(() => '=').join(''))
											console.log(' ')
											if (data.length == 0) {
												console.log('   No Tables found\n')
												console.log(' ')
												return
											}

											displayTable(data.map((c,idx) => ({
												id: idx + 1,
												name: c.id.split('.').slice(-1)[0],
												created: c.creationTime
											})), { indent: '   ' })
											console.log(' ')
										})
									})
								})
							})
					else if (answer == 'bucket') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, listStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Loading Buckets info in project ${bold(projectId)}`)
								return gcp.bucket.list(projectId, token, options).then(({ data: buckets }) => {
									waitDone()
									const title = `Buckets In Project ${projectId}`
									console.log(`\nBuckets In Project ${bold(projectId)}`)
									console.log(collection.seed(title.length).map(() => '=').join(''))
									console.log(' ')
									if (!buckets || buckets.length == 0)
										console.log('   No Buckets found\n')
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
								})
							})
					else
						return _listProjectDetails(activeProjectIds, token, options)
				})
			}).catch(e => {
				waitDone()
				console.log(error('Failed to list services', e.message, e.stack))
				throw e
			})
	})
	.then(() => listStuffs(merge(options, { question: 'What else do you want to list?' })))

const _addLeakinStatus = v => {
	if (!v)
		return v
	v.isFlex = v.env && v.env != 'standard'
	v.autoScalingHasServingMinInstances = v.automaticScaling && (v.automaticScaling.minIdleInstances > 0 || (v.automaticScaling.standardSchedulerSettings && v.automaticScaling.standardSchedulerSettings.minInstances > 0))
	v.isServingBasicScaling = v.basicScaling
	v.isServingManualScaling = v.manualScaling
	v.isLeaking = v.servingStatus == 'SERVING' && !v.traffic && (v.isFlex || v.autoScalingHasServingMinInstances || v.isServingBasicScaling || v.isServingManualScaling)
	return v
}

const _listProjectDetails = (projectIds, token, options={}) => Promise.resolve(null).then(() => {
	let waitDone = wait(`Getting information for ${projectIds.length} project${projectIds.length > 1 ? 's' : ''}`)
	return Promise.all(projectIds.map(projectId => 
		gcp.app.service.list(projectId, token, { debug: options.debug, verbose: false, includeVersions: true })
			.then(({ data }) => ({ projectId, data }))
			.catch(() => ({ projectId, data: null }))))
		.then(values => {
			waitDone()
			console.log(' ')
			const sortedValues = collection.sortBy(values, x => !x.data ? -1 : (x.data || []).length, 'des')
			sortedValues.forEach(({ projectId, data }, idx) => {
				const stats = (data || []).reduce((acc, service) => {
					acc.count++
					acc.versionsCount += (service.versions || []).length
					return acc
				}, { count: 0, versionsCount: 0})
				const statsMgs = 
				!data ? 'No App Engine setup yet' : 
					data.length == 0 ? 'No services found' : 
						`${stats.count} service${stats.count > 1 ? 's' : ''} - ${stats.versionsCount} version${stats.versionsCount > 1 ? 's' : ''}`
				// 1. Show projects
				console.log(`${bold(idx+1)}. ${bold(projectId)} (${statsMgs})`)

				const services = displayTable((data || []).map(service => {
					const name = service.id 
					const versions = (service.versions || []).map(v => _addLeakinStatus(v))
					const versionsCount = versions.length
					const lifeVersionsCount = versions.filter(v => v.traffic > 0 && v.servingStatus == 'SERVING').length // i.e., the ones which are being used to serve traffic
					const leakingVersionsCount = versions.filter(v => v.isLeaking).length // i.e., the ones which are burning cash though they are not being used
					const harmlessInactiveVersionsCount = versions.filter(v => !v.traffic && !v.isLeaking).length // i.e., the ones which are not burning cash though they are not being used

					return { 
						service: name, 
						'url': `https://${name == 'default' ? '' : `${name}-dot-`}${projectId}.appspot.com`,
						'tot. vers.': versionsCount, 
						'live vers.': lifeVersionsCount, 
						'leaking vers.': leakingVersionsCount, 
						'harmless vers.': harmlessInactiveVersionsCount,
						'how to start/stop service?': lifeVersionsCount > 0 ? `neap stop ${name} -p ${projectId}` : `neap start ${name} -p ${projectId}`
					}
				}), { indent: '   ' })

				console.log(gray(`     For more info, go to ${link(`https://console.cloud.google.com/appengine?project=${projectId}`)}`))
				if (services.length > 0)
					console.log('\n')
			})
			_showLegend()
		})
})

const _adjustContentToWidth = (content, maxWidth, options={}) => {
	content = `${content}` || ''
	const { paddingLeft=0, paddingRight=0, format } = options
	const padLeft = collection.seed(paddingLeft).map(() => ' ').join('')
	const padRight = collection.seed(paddingRight).map(() => ' ').join('')
	const missingBlanksCount = maxWidth - (paddingLeft + content.length + paddingRight)
	const missingBlanks = missingBlanksCount > 0 ? collection.seed(missingBlanksCount).map(() => ' ').join('') : ''
	return padLeft + ((format && typeof(format) == 'function') ? format(content) : content) + missingBlanks + padRight
}

const _getMaxColWidth = (contents=[], options={}) => {
	const { paddingLeft= 2, paddingRight= 4 } = options
	return Math.max(...contents.map(content => `${content}`.length)) + paddingLeft + paddingRight
}

const _getAppJsonFiles = (options={}) => file.getJsonFiles(options.projectPath, options)
	.catch(() => [])
	.then(jsonFiles => jsonFiles.map(x => path.basename(x)).filter(x => x.match(/^app\./) && (x.split('.').length == 3 || x.split('.').length == 2)))

const _getHostingFromFileName = (fileName, projectPath) => Promise.resolve(null).then(() => {
	const env = !fileName || fileName == 'app.json' ? null : fileName.match(/app\.(.*?)\.json/)[1]
	return hostingHelper.get(projectPath, { env })
})

const chooseAProject = (appJsonFiles=[], allowedProjectIds=[], token, comeBackToMenu, options={}) => {
	const getProj = (appJsonFiles && appJsonFiles.length > 0) 
		? Promise.all(appJsonFiles.map(f => _getHostingFromFileName(f, options.projectPath)))
			.then(values => {
				const projectIds = Object.keys((values || []).filter(x => x && x.projectId).reduce((acc,key) => {
					acc[key.projectId] = true
					return acc
				}, {}))

				if (projectIds.length == 0)
					return { projectId: null, token }
				else {
					const authorizedProjects = projectIds.filter(id => allowedProjectIds.some(pId => pId == id))
					const nonAuthorizedProjects = projectIds.filter(id => !allowedProjectIds.some(pId => pId == id))
					const fName = appJsonFiles.length == 1 ? `in your ${bold(appJsonFiles[0])}` : `across multiple ${bold('app.<env>.json')}`
					const msg = projectIds.length == 1
						? `We've found a single Google Cloud Project defined ${fName}`
						: `We've found different Google Cloud Projects defined ${fName}`
					console.log(info(msg))
					if (nonAuthorizedProjects.length > 0) {
						console.log(warn('You\'re currently logged in to a Google Account which does not have access to all the projects defined in the app.<env>.json files'))
						console.log(info(`Your current Google Account contains ${bold(allowedProjectIds.length)} active projects. The following projects are not listed amongst them:`))
						nonAuthorizedProjects.forEach(id => {
							console.log(`    - ${bold(id)}`)
						})
					}
					const authChoices = [
						...authorizedProjects.map(value => ({ name: `Use ${bold(value)}`, value })),
						{ name: 'Use another project', value: '[other]' },
						{ name: 'Login to another Google Account', value: 'account', specialOps: true }
					]

					const formattedChoices = authChoices.map((x, idx) => ({
						name: ` ${idx+1}. ${x.name}`,
						value: x.value
					}))

					return promptList({ message: 'Next:', choices: formattedChoices, separator: false }).then(answer => {
						if (!answer)
							return comeBackToMenu(options)
						else if (answer == '[other]')
							return { projectId: null, token }
						else if (answer == 'account')
							return utils.account.choose(merge(options))
						else
							return { projectId: answer, token }
					})
				}
			})
		: Promise.resolve({ projectId: null, token })

	return getProj.then(({ projectId, token }) => {
		if (projectId)
			return { projectId, token }
		else {
			const choices = [
				...allowedProjectIds.map(value => ({ name: `${bold(value)}`, value })),
				{ name: `${'Login to another Google Account'}`, value: 'account', specialOps: true }
			]

			const formattedChoices = choices.map((x, idx) => {
				if (x.value == 'account')
					return x
				else
					return { name: ` ${idx+1}. ${x.name}`, value: x.value }
			})

			return promptList({ message: 'Choose a project, Login to another account or Abort:', choices: formattedChoices, separator: false }).then(answer => {
				if (!answer)
					return comeBackToMenu(options)
				else if (answer == 'account')
					return utils.account.choose(merge(options))
				else
					return { projectId: answer, token }
			})
		}
	})
}

const listProjectServices = (projectId, token, options) => {
	const title = `Services for project ${projectId}`
	if (!options.displayOff)
		console.log(`\nServices for project ${bold(projectId)}`)
	console.log(collection.seed(title.length).map(() => '=').join(''))
	const loadingDone = wait(`Loading services for project ${bold(projectId)}...`)
	return gcp.app.service.list(projectId, token, { debug: options.debug, verbose: false, includeVersions: true })
		.catch(() => ({ data: []}))
		.then(({ data }) => {
			loadingDone()
			// 3. Display the results
			const opts = { paddingLeft: 2, paddingRight: 2 }
			const deploymentPaddingLeft = 2
			const deployPaddLeft = collection.seed(deploymentPaddingLeft).map(() => ' ').join('')

			if (!data || !data.length) {
				console.log(`${deployPaddLeft}No services found\n`)
				return
			}

			const headerOpts = Object.assign({}, opts, { format: gray })
			data = data || []
			const stats = data.reduce((acc, service) => {
				acc.count++
				acc.versionsCount += (service.versions || []).length
				return acc
			}, { count: 0, versionsCount: 0})
			// 3.1. Display stats
			console.log(`\nStats: ${bold(stats.count)} services, ${bold(stats.versionsCount)} versions`)
			data.forEach((service,i) => {
				// 3.2. Display service name and url
				console.log(`${`\n${i+1}. `}${bold(service.id)} (${(service.versions || []).length} versions) - ${service.url}`)
				if (service.versions && service.versions.length > 0) {
					const versions = service.versions.map(v => _addLeakinStatus(v)).map(v => ({
						'latest deploy': v.id, // e.g., 'v1'
						'traffic alloc.': `${(v.traffic * 100).toFixed(2)}%`,
						status: v.servingStatus, // e.g., 'SERVING'
						type: v.env, // e.g., 'standard' or 'flex'
						created: v.createTime,
						user: (v.createdBy || '').toLowerCase(),
						leaking: v.isLeaking ? 'TRUE' : 'FALSE',
						'how to stop the leak?': v.isLeaking ? 'neap clean' : 'N.A.' 
					})).slice(0,5)

					const deployments = Object.keys(versions[0]).map(colName => {
						const colWidth = _getMaxColWidth([colName, ...versions.map(v => v[colName])], opts)
						const header = _adjustContentToWidth(colName, colWidth, headerOpts)
						const nonFormattedhHeader = _adjustContentToWidth(colName, colWidth, Object.assign({}, headerOpts, { format: null }))
						const colItems = versions.map(v => _adjustContentToWidth(v[colName], colWidth, opts))
						return { header, nonFormattedhHeader, items: colItems }
					})

					// 3.3. Display the versions, i.e., the deployments
					// header
					const h = `${deployPaddLeft}|${deployments.map(d => d.header).join('|')}|`
					const nonFormattedH = `|${deployments.map(d => d.nonFormattedhHeader).join('|')}|`
					const u = deployPaddLeft + collection.seed(nonFormattedH.length).map(() => '=').join('')
					console.log(h) 
					console.log(u) 
					// body
					versions.forEach((v,idx) => console.log(`${deployPaddLeft}|${deployments.map(d => d.items[idx]).join('|')}|`))
					console.log(gray(`${deployPaddLeft}for more info about this service, go to https://console.cloud.google.com/appengine/versions?project=${projectId}&serviceId=${service.id}\n`))
				} else
					console.log(`${deployPaddLeft}No deployments found\n`)
			})
			return 
		}).catch(e => {
			loadingDone()
			console.log(error('Failed to list services', e.message, e.stack))
			throw e
		})
}

const _getSubDomains = (domain, subDomains) => {
	subDomains = subDomains || []
	if (!domain || !domain.id || subDomains.length == 0)
		return []
	else
		return subDomains.filter(d => d && d.id && d.id != domain.id && d.id.indexOf(domain.id) >= 0)
}

const _getDomains = (subDomain, domains) => {
	domains = domains || []
	if (!subDomain || !subDomain.id || domains.length == 0)
		return null
	else
		return domains.filter(d => d && d.id && d.id != subDomain.id).find(d => subDomain.id.indexOf(d.id) >= 0)
}

const _getDomainAndSubdomain = fqdm => {
	const parts = (fqdm || '').split('.')
	return {
		domain: parts.slice(-2).join('.'),
		subDomain: parts.slice(0,-2).join('.')
	}
}

const _formatGoogleDomainRes = domains => (domains || []).reduce((acc, domain) => {
	const subDomains = _getSubDomains(domain, domains)
	const { domain: dm, subDomain: sbdm } = _getDomainAndSubdomain(domain.id)
	const autoSSLon = domain.sslSettings && domain.sslSettings.sslManagementType == 'AUTOMATIC' && domain.sslSettings.certificateId
	const certId = (domain.sslSettings || {}).certificateId
	const resources = (domain.resourceRecords || []).map(r => {
		r.name = sbdm
		r.autoSSLon = autoSSLon
		r.certId = certId
		return r
	})
	if (subDomains.length > 0) {
		const records = [
			...resources, 
			...subDomains.reduce((a,d) => {
				const subAutoSSLon = d.sslSettings && d.sslSettings.sslManagementType == 'AUTOMATIC' && d.sslSettings.certificateId
				const subCertId = (d.sslSettings || {}).certificateId
				const { subDomain: _sbdm } = _getDomainAndSubdomain(d.id)
				a.push(...(d.resourceRecords || []).map(r => {
					r.name = _sbdm
					r.autoSSLon = subAutoSSLon
					r.certId = subCertId
					return r
				}))
				return a
			}, [])]

		acc[dm] = records
	} 
	else if (!_getDomains(domain, domains)) // this domain has no subdomain and is not the subdomain of another domain
		acc[dm] = resources
	
	return acc
}, {})

/**
 * [description]
 * @param  {[type]} projectId [description]
 * @param  {[type]} token     [description]
 * @param  {[type]} options   [description]
 * @return {[type]}           [description]
 */
const listProjectDomains = (projectId, token, options={}) => {
	const rawtTitle = `Custom Domains for project ${projectId}`
	if (!options.displayOff) {
		console.log(`\nCustom Domains for project ${bold(projectId)}`)
		console.log(collection.seed(rawtTitle.length).map(() => '=').join(''))
		console.log(' ')
	}
	const loadingDone = options.displayOff ? (() => null) : wait(`Loading custom domains for project ${bold(projectId)}...`)
	return gcp.app.domain.list(projectId, token, { debug: options.debug, verbose: false })
		.catch(() => ({ data: []}))
		.then(({ data }) => {
			loadingDone()
			// 1. Display the results
			const domains = _formatGoogleDomainRes(data)
			if (!options.displayOff) {
				if (data.length == 0)
					console.log('   No custom domains found\n')
				else
					Object.keys(domains).forEach((domainName, idx) => {
						console.log(`${bold(idx+1)}. ${bold(domainName)} Records:\n`)
						displayTable(domains[domainName].map(r => ({
							'set up as': r.type == 'CNAME' ? 'subdomain' : 'domain',
							'record type': r.type,
							name: r.name,
							value: r.rrdata
						})), { indent: '   ' })
						console.log(' ')
					})
			}
			return domains
		}).catch(e => {
			loadingDone()
			console.log(error('Failed to list domains', e.message, e.stack))
			throw e
		})
}

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

module.exports = {
	list: listStuffs,
	listDomains: listProjectDomains,
	listServices: listProjectServices,
	chooseAProject,
	_: {
		formatGoogleDomainRes: _formatGoogleDomainRes
	}
}




