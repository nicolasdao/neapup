/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const path = require('path')
const url = require('url')
const gcp = require('../gcp')
const utils = require('../utils')
const { 
	bold, wait, error, promptList, link, askQuestion, 
	question, success, displayTable, searchAnswer, 
	info, cmd, warn, displayList } = require('../../../utils/console')
const { obj: { merge }, file, collection, timezone, validate, console: csle } = require('../../../utils')
const { displayTable: displayTableV2, displayTitle, cyan } = csle
const projectHelper = require('../project')
const { chooseAProject } = require('./list')
const getToken = require('../getToken')
const api = require('../api')
const { bucketHelper, coreHelper } = require('../helpers')

const addStuffs = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true }))
	.then(({ token }) => {
		let waitDone = wait('Gathering information about your Google Cloud Account')
		return gcp.project.list(token, options)
			.then(({ data }) => {
				waitDone()
				const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
				const activeProjectIds = activeProjects.map(p => p.projectId)
				const topLevelChoices = [
					{ name: ' 01. Project', value: 'project' },
					{ name: ' 02. Custom Domain', value: 'domain' },
					{ name: ' 03. Routing Rule', value: 'routing' },
					{ name: ' 04. Cron Job', value: 'cron' },
					{ name: ' 05. Task Queue', value: 'queue' },
					{ name: ' 06. Bucket', value: 'bucket' },
					{ name: ' 07. BigQuery', value: 'bigquery' },
					{ name: ' 08. Access', value: 'access' },
					{ name: ' 09. Google APIs', value: 'apis' },
					{ name: ' 10. Website or Domain Ownership', value: 'webownership' },
					{ name: 'Login to another Google Account', value: 'account', specialOps: true }
				]

				options.projectPath = projectHelper.getFullPath(options.projectPath)

				return promptList({ message: (options.question || 'What do you want to add?'), choices: topLevelChoices, separator: false }).then(answer => {
					if (!answer)
						process.exit()
					if (answer == 'domain') {
						console.log(error('Oops!!! This is not supported yet'))
						return 
					} 
					else if (answer == 'project')
						return projectHelper.create(token, merge(options, { createAppEngine: true, noExit: true }))
					else if (answer == 'apis')
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => _selectGoogleApis().then(apis => {
								if (!apis)
									return 

								return askQuestion(question(`Are you sure you want to enable ${apis == 'all' ? 'all APIs' : `${apis.length} API${apis.length == 1 ? '' : 's'}`} in project ${answer} (Y/n) ? `)).then(yes => {
									if (yes == 'n')
										return 
									
									waitDone = wait('Enabling all apis')
									return api.enable(projectId, apis, token, options).then(() => {
										waitDone()
										console.log(success(`${apis == 'all' ? 'All APIs' : `${apis.length} API${apis.length == 1 ? '' : 's'}`} enabled in project ${bold(answer)}`))
									})
								})
							}))
					else if (answer == 'cron') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting services for project ${bold(projectId)}`)
								return gcp.app.service.list(projectId, token, merge(options, { verbose: false }))
									.then(({ data: services }) => {
										waitDone()
										if (services.length == 0) {
											console.log(info(`No services found for project ${bold(projectId)}`))
											console.log(info('You cannot add a Cron job if there are no services'))
											console.log(info('Deploy at least one service and then come back here'))
											return
										} else {
											const serviceChoices = services.map((s, idx) => ({ name: ` ${bold(idx+1)}. ${bold(s.id)}`, value: s.id }))
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
												let description, pathname, schedule, target, timezone, serviceUrl
												// 1. Add a description
												return askQuestion(question('New Cron job description (optional): ')) 
													.then(answer => { // 2. Add a target
														description = answer
														return promptList({ 
															message: 'Which service should be triggered by the Cron job?', 
															choices: serviceChoices, 
															separator: false,
															noAbort: true
														})
													})
													.then(answer => { // 3. Add a url
														target = answer 
														serviceUrl = `https://${target == 'default' ? projectId : `${target}-dot-${projectId}`}.appspot.com`
														console.log(info(`The Cron job uses HTTP GET to fire your service located at ${link(bold(serviceUrl))}`))
														return askQuestion(question(`Which path should it fire (optional, default is ${bold('/')}) ? `))
													})
													.then(answer => { // 4. Choose a timezone
														pathname = answer ? (url.parse(answer).pathname || '/') : '/'
														if (pathname.indexOf('/') != 0)
															pathname = `/${pathname}`
														return _chooseTimeZone()
													})
													.then(answer => { // 5. Add a schedule
														timezone = answer
														return _configureCronSchedule()
													})
													.then(answer => { // 6. Add the Cron
														if (answer) {
															schedule = answer
															let cronJob = {
																description,
																url: pathname,
																target,
																schedule: _formatScheduleForGoogle(schedule),
																creationDate: new Date()
															}
															if (timezone)
																cronJob.timezone = timezone

															console.log(info('You\'re about to create the following Cron job:\n'))
															displayList([
																{ name: 'Description', value: cronJob.description },
																{ name: 'Firing schedule', value: `${cronJob.schedule}${timezone ? ` (${timezone})` : ' (UTC/GMT)'}` },
																{ name: 'Fired service', value: `${serviceUrl}${pathname}` }
															], { indent: '  ' })
															console.log(' ')

															return askQuestion(question('Are you sure you want to create it (Y/n) ? ')).then(yes => {
																if (yes == 'n')
																	return 
																
																const newCronJobs = cronJobs || []
																newCronJobs.push(cronJob)
																waitDone = wait('Adding new Cron job...')
																return getToken(options)
																	.then(token => gcp.app.cron.update(projectId, newCronJobs, token, options))
																	.then(() => {
																		waitDone()
																		console.log(success(`New Cron job successfully added to project ${projectId}`))
																	})
															})
														}
													})
											})
										}
									})
							})
					else if (answer == 'queue') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting services for project ${bold(projectId)}`)
								return gcp.app.service.list(projectId, token, merge(options, { verbose: false }))
									.then(({ data: services }) => {
										waitDone()
										if (services.length == 0) {
											console.log(info(`No services found for project ${bold(projectId)}`))
											console.log(info('You cannot add a Task Queue if there are no services'))
											console.log(info('Deploy at least one service and then come back here'))
											return
										} else {
											const serviceChoices = services.map((s, idx) => ({ name: ` ${bold(idx+1)}. ${bold(s.id)}`, value: s.id }))
											waitDone = wait(`Getting Task Queue config for project ${bold(projectId)}`)
											return gcp.app.queue.get(projectId, token, options).then(({ data: queues }) => {
												waitDone()
												const title = `Task Queues For Project ${projectId}`
												console.log(`\nTask Queues For Project ${bold(projectId)}`)
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

												let taskQueueName, rate, target, bucketSize, maxConcurrentRequests, timeUnit
												// 1. Add a target
												return promptList({ 
													message: 'Which service should process each enqueued task? ', 
													choices: serviceChoices, 
													separator: false,
													noAbort: true })
													.then(answer => { // 2. Name the queue
														target = answer 
														const defaultName = target.toLowerCase()
														return coreHelper.enterName(`Enter a queue name (default ${bold(defaultName)}): `, 'The queue name is required.', { default: defaultName })
													})
													.then(answer => { // 3. Enter a rate unit
														taskQueueName = answer
														const rateUnits = [
															{ name: 'milliseconds', value: 'milliseconds' },
															{ name: 'seconds', value: 'seconds' },
															{ name: 'minutes', value: 'minutes' },
															{ name: 'hours', value: 'hours' },
															{ name: 'days', value: 'days' }
														]
														return promptList({ message: `Choose a time unit for the frequency at which the queue pushes tasks to the ${target} service: `, choices: rateUnits, separator: false, noAbort: true })
													})
													.then(answer => { // 4. Enter a rate number
														timeUnit = answer
														const example = timeUnit == 'milliseconds' ? 200 : 2
														return _chooseNumber(`How often does the queue push tasks to the ${target} service? (ex: Enter ${bold(example)} for ${bold(`every ${example} ${timeUnit}`)}) : `, { ge: 1 })
													})
													.then(answer => { // 4. Enter bucket size
														rate = answer 
														return _chooseNumber(`How many tasks does the queue push to the ${target} service every ${bold(rate)} ${bold(timeUnit)} (optional, default is 5, max. is 500) ? `, { range: [1,500], default: 5 })
													})
													.then(answer => { // 5. Enter the max concurrent request
														bucketSize = answer
														return _chooseNumber(`What's the max. number of concurrent tasks that can be pushed to the ${target} service (optional, default is 1000, max. is 5000) ? `, { range: [1,5000], default: 1000 })
													})
													.then(answer => { // 6. Add the new Task Queue
														maxConcurrentRequests = answer
														const overridingExistingQueue = (queues || []).find(({ name }) => name == taskQueueName)
														const confirm = overridingExistingQueue
															? (() => {
																console.log(warn(`You're about to override the existing ${bold(taskQueueName)} task queue`))
																return askQuestion(question('Are you sure you want to continue (Y/n) ? '))
															})()
															: Promise.resolve('yes')

														return confirm.then(yes => {
															if (yes == 'n')
																return null

															const newQueue = {
																name: taskQueueName, 
																rate: _formatTaskRateForGoogle(rate, timeUnit),
																formattedRate: `every ${rate} ${timeUnit}`, 
																target, 
																bucketSize, 
																maxConcurrentRequests,
																creationDate: new Date()
															}

															console.log(info('You\'re about to create the following Queue:\n'))
															displayList([
																{ name: 'Name', value: newQueue.name },
																{ name: 'Processing service', value: newQueue.target },
																{ name: 'Processing frequency', value: newQueue.formattedRate },
																{ name: ['Max nbr. of tasks processed', `at once ${newQueue.formattedRate}`], value: newQueue.bucketSize },
																{ name: ['Max nbr. of concurrent', 'tasks requests'], value: newQueue.maxConcurrentRequests },
															], { indent: '  ' })
															console.log(' ')

															return askQuestion(question('Are you sure you want to create it (Y/n) ? ')).then(yes => {
																if (yes == 'n')
																	return 
																
																const updatedQueues = [
																	...(queues || []).filter(({ name }) => name != taskQueueName), 
																	newQueue]
																waitDone = wait('Creating new Task Queue...')
																return getToken(options)
																	.then(token => gcp.app.queue.update(projectId, updatedQueues, token, options))
																	.then(() => {
																		waitDone()
																		console.log(success(`New Task Queue ${bold(taskQueueName)} successfully created in project ${projectId}`))
																		return token
																	})
															})
														})
													})
													.then(token => { // 6. Checking if we need a new Service Account to push task to Task Queues
														if (!token) {
															console.log(' ')
															return null
														}
														
														waitDone = wait(`Checking service account details for project ${bold(projectId)}...`)
														return gcp.project.serviceAccount.list(projectId, token, merge(options, { includeKeys: true })).then(({ data: svcAccounts }) => {
															waitDone()
															const svcAccountsWithTaskQueueRoles = (svcAccounts || []).filter(a => a.roles && a.roles.some(r => r == 'roles/appengine.appViewer') && a.roles.some(r => r == 'roles/cloudtasks.enqueuer') && a.keys.length > 0)
															if (svcAccountsWithTaskQueueRoles.length == 0) {
																waitDone = wait('Creating a new service account to allow clients to push tasks to this new queue...')
																return gcp.project.serviceAccount.create(
																	projectId, 
																	taskQueueName, 
																	'neapup-task-queue', 
																	token, 
																	merge(options, { roles: ['roles/appengine.appViewer', 'roles/cloudtasks.enqueuer'], createJsonKey: true }))
																	.then(({ data }) => {
																		waitDone()
																		console.log(success(`New service account successfully created in project ${bold(projectId)}`))
																		console.log(info('This service account allows 3rd party systems to push tasks to the newly created queue'))
																		console.log(info(`To push new tasks to the queue, 3rd parties must use the following ${bold('JSON key')} to acquire an OAuth2 token\n`))
																		console.log(`  ${bold('COPY THIS JSON KEY INTO A .json FILE')}`)
																		console.log('  ====================================\n')
																		console.log(JSON.stringify(data.jsonKey, null, '  '))
																		console.log(' ')
																	})
															}
														})
													})
											})
										}
									})
							})
					else if (answer == 'access')
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => {
								const choices = [
									{ name: `I want to give access to a ${bold('Collaborator')} to help me manage my Cloud`, value: 'user' },
									{ name: `I want to give access to an ${bold('Agent')} so it can use my Cloud (e.g., adding files to my Storage)`, value: 'agent' }
								]

								return promptList({ message: 'What type of access do you want to grant? ', choices, separator: false }).then(answer => {
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
					else if (answer == 'bucket') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => {
								return _listBuckets(projectId, token, waitDone, options).then(() => {
									let bucketName, bucketLocation
									return bucketHelper.chooseName()
										.then(answer => {
											bucketName = answer 
											return bucketHelper.chooseLocation()
										}).then(answer => {
											if (!answer)
												return 

											bucketLocation = answer
											return askQuestion(question(`Are you sure you want to create this bucket in project ${bold(projectId)} (Y/n) ? `)).then(yes => {
												if (yes == 'n')
													return 

												waitDone = wait('Creating bucket')
												return gcp.bucket.create(bucketName, projectId, token, merge(options, { location: bucketLocation })).then(() => {
													waitDone()
													console.log(success(`Bucket successfully created in project ${bold(projectId)}`))
												})
											})
										})
								})
							})
					else if (answer == 'bigquery') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
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
									}

									displayTable(dbs.map((c,idx) => ({
										id: idx + 1,
										name: c.id.split(':').slice(-1)[0],
										location: c.location
									})), { indent: '   ' })
									console.log(' ')

									const choices = [
										{ name: ' 1. Create a new DB', value: 'db' },
										{ name: ' 2. Create a new DB Table', value: 'table' },
										{ name: ' 3. Create a new DB Table Using Bucket\'s Data', value: 'table-bucket' }
									]
									return promptList({ message: 'What do you want to do? ', choices, separator: false }).then(answer => {
										if (!answer)
											return
										else if (answer == 'db') {
											return coreHelper.enterName('Enter a DB name: ', 'Invalid DB name. No spaces or special special characters except - are allowed.', merge(options, { rule: /^[a-zA-Z0-9_]+$/ })).then(answer => {
												return askQuestion(question(`Are you sure you want to create a new ${bold(answer)} BigQuery DB in project ${bold(projectId)} (Y/n) ? `)).then(yes => {
													if (yes == 'n')
														return
													
													waitDone = wait('Creating a new BigQuery DB')
													return gcp.bigQuery.create(projectId, answer, token, options).then(() => {
														waitDone()
														console.log(success(`New BigQuery DB ${bold(answer)} successfully created in project ${bold(projectId)}`))
													})
												})
											}) 
										} else {
											const createTableFromBucket = answer == 'table-bucket'
											const choices = dbs.map((db,idx) => ({ name: ` ${bold(idx+1)}. ${bold(db.id.split(':').slice(-1)[0])}`, value: db.id.split(':').slice(-1)[0] }))
											return promptList({ message: 'Which DB do you want to add a table to?', choices, separator: false }).then(dbName => {
												if (!dbName)
													return 
												waitDone = wait(`Loading all tables in DB ${bold(dbName)} in project ${bold(projectId)}`)
												return Promise.all([
													gcp.bigQuery.table.list(projectId, dbName, token, options),
													_listBuckets(projectId, token, waitDone, merge(options, { quiet: true }))
												]).then(([{ data }, buckets=[]]) => {
													waitDone()
													const title = `Tables In DB ${dbName} In Project ${projectId}`
													console.log(`\nTables In DB ${bold(dbName)} In Project ${bold(projectId)}`)
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
													if (createTableFromBucket && !buckets.some(x => x)) {
														console.log(warn(`You don't have any bucket in project ${bold(projectId)}. Create a bucket first, and then create a table from that bucket.`))
														return
													}
													
													let tableName, bucketName, bucketPath, bucketLocation
													return coreHelper.enterName('Enter a table name: ', 'Invalid table name. No spaces or special special characters except - are allowed.', merge(options, { rule: /^[a-zA-Z0-9_]+$/ }))
														.then(answer => {
															tableName = answer
															const choices = buckets.map(({ id },idx) => ({ name: ` ${idx+1}. ${id}`, value: id }))
															return createTableFromBucket
																? promptList({ message: 'Which bucket do you want to use to create a table from?', choices, separator: false })
																: 'no-bucket'
														})
														.then(answer => {
															if (!answer)
																return
															bucketName = answer
															return createTableFromBucket
																? askQuestion(question('Which path are the data located (Optional. Default is empty) ? ')).then(p => p || 'no path')
																: 'no path'
														})
														.then(answer => {
															if (!answer)
																return
															bucketPath = answer == 'no path' ? null : answer
															bucketLocation = `gs://${bucketName}${bucketPath ? `/${bucketPath.replace(/^\//, '')}` : ''}`
															
															const checkIfBucketDataExists = createTableFromBucket
																? gcp.bucket.content.list(bucketName, token, merge(options, { prefix: bucketPath })).then(({ data=[] }) => data.some(x => x))
																: Promise.resolve(true)

															return checkIfBucketDataExists.then(yes => {
																if (!yes) {
																	console.log(error(`Failed to create new table from bucket's data. The bucket source ${bold(bucketLocation)} dos not contain any data.`))
																	return
																}
																
																return askQuestion(question(`Are you sure you want to create a new ${bold(tableName)} table in DB ${bold(dbName)} in project ${bold(projectId)} using data located under ${bold(bucketLocation)} (Y/n) ? `)).then(yes => {
																	if (yes == 'n')
																		return
																		
																	waitDone = wait('Creating a new BigQuery table') 
																	return (createTableFromBucket 
																		? gcp.bigQuery.table.createFromBucket(projectId, dbName, tableName, bucketName, bucketPath, token, options)
																		: gcp.bigQuery.table.create(projectId, dbName, tableName, token, options)).then(() => {
																		waitDone()
																		console.log(success(`New BigQuery table ${bold(tableName)} successfully created in DB ${bold(dbName)} in project ${bold(projectId)}`))
																	})
																})
															})
														})
												})
											})
										}
									})
								})
							})
					else if (answer == 'webownership') {
						waitDone = wait('Listing all digital properties (i.e., domains and websites)...')
						return gcp.siteVerification.list(token).then(({data}) => {
							waitDone()
							const items = (data || {}).items || []
							displayTitle('Domain & Website Ownerships')
							if (!items || items.length == 0)
								console.log('   No Domain or Website found\n')
							else {
								displayTableV2(items.map((c, idx) => ({
									id: idx + 1,
									name: decodeURIComponent(c.id),
									identifier: c.site.identifier,
									type: c.site.type, 
									owners: c.owners
								})), { indent: '   ' })
							}
							console.log(' ')

							const choices = [
								{ name: ' 1. New domain or website proof of ownership', value: 'domainOrWebsite' }, 
								{ name: ' 2. New owner to an existing domain or website', value: 'owner' }]

							const nextQuestion = (items.length > 0) 
								? promptList({ message: 'What do you want to add?', choices, separator: false })
								: askQuestion(question('Do you want to add a new domain or website proof of ownership (Y/n)? '))

							return nextQuestion.then(answer => {
								if ((items.length > 0 && !answer) || answer == 'n')
									return 
								answer = !answer || answer == 'y' || answer == 'Y' || answer == 'domainOrWebsite' ? 'domainOrWebsite' : 'owner'
								
								if (answer == 'domainOrWebsite') {
									const domainOrWebsiteChoices = [{ name: 'Verify a domain ownership', value: 'domain' }, { name: 'Verify a website ownership', value: 'web' }]
									let domain, website, method
									return promptList({ message: 'Choose one of the following options:', choices: domainOrWebsiteChoices, separator: false, noAbort: true }).then(answer => {
										const getName = answer == 'domain' ? _chooseDomain('Enter a domain name: ') : _chooseWebsite('Enter a website URL: ')
										return getName.then(name => {
											const verificationMethods = ['DNS_TXT', 'DNS_CNAME']
											if (answer == 'domain')
												domain = name 
											else {
												website = name 
												verificationMethods.push(...['FILE', 'META'])
											}
											const verificationChoices = verificationMethods.map((m,idx) => ({ name: ` ${idx+1}. ${m}`, value: m }))
											return promptList({message: 'Choose a verification method: ', choices: verificationChoices, separator: false, noAbort: true}).then(answer => {
												waitDone = wait('Retrieving your verification methods details...')
												method = answer
												return gcp.siteVerification.getToken({ method, domain, website }, token).then(({ data }) => {
													waitDone()
													if (answer == 'DNS_TXT') 
														console.log(info('Add a new TXT record in your DNS with the following value:'))
													else if (answer == 'DNS_CNAME') 
														console.log(info('Add a new CNAME record in your DNS with the following value:')) 
													else if (answer == 'FILE') 
														console.log(info('Add the following empty file under your website root:')) 
													else if (answer == 'META') 
														console.log(info('Add the following META tag in the header of your home page:')) 

													console.log(info(`  ${cyan(data.token)}`))
													console.log(' ')
													return askQuestion('Once that\'s done, come back here and press ENTER').then(() => getToken(options)).then(token => {
														waitDone = wait(`Verifying your ${domain ? 'domain' : 'website'} ownership now...`)
														return gcp.siteVerification.verify({ method, domain, website }, token)
															.then(() => {
																waitDone()
																console.log(success(`Awesome! Your ${domain ? 'domain' : 'website'} ownership for ${domain || website} has been successfully confirmed.`))
															})
															.catch(err => {
																waitDone()
																const e = JSON.parse(err.message)
																console.log(error(e.message))
																if (method == 'DNS_TXT' || method == 'DNS_CNAME')
																	console.log(warn('Your DNS change may take a few hours to propagate. If you\'re sure you\'ve added the record properly, maybe wait a couple of hours before verifying again.'))
															})
													})
												})
											})
										})
									})
								} else {
									const webResourceChoices = items.map((i,idx) => ({ name: ` ${idx+1}. ${decodeURIComponent(i.id)}`, value: i.id }))
									return promptList({message: 'Select web resource:', choices: webResourceChoices, separator: false}).then(resourceId => {
										if (!resourceId)
											return 
										return _chooseEmail('Enter the new owner\'email: ', 'An email is required to add a new owner.').then(owner => {
											return askQuestion(question(`Are you sure you want to add ${cyan(owner)} as an owner of ${cyan(decodeURIComponent(resourceId))} (Y/n)? `)).then(yes => {
												if (yes == 'n')
													return
												waitDone = wait('Setting up web resource ownership...')
												return gcp.siteVerification.addOwner({ resourceId, owner }, token).then(() => {
													waitDone()
													console.log(success(`Congrats! ${bold(owner)} has successfully been added as an owner to web resource ${bold(decodeURIComponent(resourceId))}.`))
												})
											})
										})
									})
								}
							})
						})
						// return gcp.siteVerification.getToken('DNS_TXT', 'rehost.co', token)
						// return gcp.siteVerification.list(token)
						// 	.then(({data}) => console.log(data.items))
					}
					else if (answer == 'routing') 
						console.log(error('Operation not supported yet. Coming soon...'))
					else if (answer == 'account')
						return utils.account.choose(merge(options, { skipProjectSelection: true, skipAppEngineCheck: true })).then(() => addStuffs(options))
					else
						console.log(error('Operation not supported yet. Coming soon...'))
				})
			}).catch(e => {
				waitDone()
				console.log(error('Failed to list services', e.message, e.stack))
				throw e
			})
	})
	.then(() => addStuffs(merge(options, { question: 'What else do you want to add? ' })))

/**
 * [description]
 * @param  {[type]} 	projectId 		[description]
 * @param  {[type]} 	token     		[description]
 * @param  {[type]} 	waitDone  		[description]
 * @param  {Boolean} 	options.quiet   [description]
 * @return {[type]}           			[description]
 */
const _listBuckets = (projectId, token, waitDone, options={}) => Promise.resolve(null).then(() => {
	if (!options.quiet) waitDone = wait(`Loading Buckets info from project ${bold(projectId)}`)
	return gcp.bucket.list(projectId, token, options).then(({ data: buckets=[] }) => {
		if (!options.quiet) waitDone()
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

		if (!options.quiet) {
			const title = `Buckets In Project ${projectId}`
			console.log(`\nBuckets In Project ${bold(projectId)}`)
			console.log(collection.seed(title.length).map(() => '=').join(''))
			console.log(' ')
			if (!buckets || buckets.length == 0)
				console.log('   No Buckets found\n')
			else {
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
		}

		return normalBuckets
	})
})

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
			}
			
			const choices = [
				{ name: 'Add a new Collaborator', value: 'user' },
				{ name: 'Add roles to a Collaborator', value: 'role' }
			]

			return promptList({ message: 'What do want to do: ', choices, separator: false })
				.then(answer => {
					return { projectId, token, choice: answer }
				})
				.then(({ projectId, token, choice }) => {
					if (!choice)
						return null

					if (choice == 'role') 
						return _addRolesToUser(projectId, token, waitDone, data, options)
					else
						return _addUsers(projectId, token, waitDone, data, options)
				})
		})
})

const _addUsers = (projectId, token, waitDone, users, options) => 
	_chooseEmail('Enter your Collaborator\'s email: ', 'An email is required to add a new Collaborator.', { blacklist: users.map(d => d.user) })
		.then(email => _chooseAccountRoles({ required: true }).then(roles => ({ roles, email })))
		.then(({ roles, email }) => {
			if (!email)
				return 
			return askQuestion(question(`Are you sure you want to add ${bold(email)} as a Collaborators (Y/n) ? `)).then(yes => {
				if (yes == 'n')
					return		

				waitDone = wait(`Adding a new Collaborator to project ${bold(projectId)}...`)
				return gcp.project.user.create(projectId, email, roles, token, options)
					.then(() => {
						waitDone()
						console.log(success(`New Collaborator successfully created in project ${bold(projectId)}\n`))
					})
			})
		})

const _addRolesToUser = (projectId, token, waitDone, users, options) => Promise.resolve(null).then(() => {
	if (!users || users.length == 0)
		return 

	const keyOptions = users.map((a,idx) => ({
		name: ` ${bold(idx+1)}. ${a.user}`, value: a.user
	}))

	let email
	return promptList({ message: 'Add roles to one of the following Collaborator: ', choices: keyOptions, separator: false })
		.then(answer => {
			if (answer) {
				email = answer
				return  _chooseAccountRoles({ usersOnly: true, required: true })
			}
		})
		.then(roles => {
			if (roles) {
				return askQuestion(question(`Are you sure you want to add ${roles.length} role${roles.length > 1 ? 's' : ''} (Y/n) ? `)).then(yes => {
					if (yes == 'n')
						return						
					
					waitDone = wait(`Adding roles to ${bold(email)} for project ${bold(projectId)}`)
					return gcp.project.user.roles.add(projectId, email, roles, token, options).then(() => {
						waitDone()
						console.log(success(`Roles successfully added to ${bold(email)} for project ${bold(projectId)}`))
					})
				})
			}
		})
})

const _manageServiceAccount = (projectId, token, waitDone, options) => _listServiceAccount(projectId, token, waitDone, options).then(svcAccounts => {
	if (!svcAccounts)
		return 
	
	const choices = [{ name: 'Create a new service account', value: 'account' }]

	if (svcAccounts && svcAccounts.length > 0)
		choices.push(...[
			{ name: 'Add roles to a service account', value: 'role' },
			{ name: 'Generate a new service account JSON key', value: 'key' }
		])

	return promptList({ message: 'What do want to do: ', choices, separator: false }).then(answer => {
		return { projectId, token, choice: answer }
	})
		.then(({ projectId, token, choice }) => {
			if (!choice)
				return null

			if (choice == 'key')
				return _addJsonKeyToServiceAccount(projectId, token, waitDone, svcAccounts, options)
			else if (choice == 'role') 
				return _addRolesToServiceAccount(projectId, token, waitDone, svcAccounts, options)
			else
				return _addServiceAccount(projectId, token, waitDone, svcAccounts, options)
		})
})

const _addJsonKeyToServiceAccount = (projectId, token, waitDone, svcAccounts, options) => Promise.resolve(null).then(() => {
	if (!svcAccounts || svcAccounts.length == 0)
		return 

	const keyOptions = svcAccounts.map((a,idx) => ({
		name: ` ${bold(idx+1)}. ${a.displayName} - ${a.email.split('@')[0]}`, value: idx
	}))

	return promptList({ message: `Generate a new ${bold('JSON Key')} for one of the following service accounts: `, choices: keyOptions, separator: false }).then(answer => {
		if (answer >= 0) {
			const { email: serviceEmail, displayName } = svcAccounts[answer*1]
			waitDone = wait(`Generating a new JSON Key for the ${bold(displayName)} service account in project ${bold(projectId)}...`)
			return gcp.project.serviceAccount.key.generate(projectId, serviceEmail, token, merge(options, { verbose: false }))
				.then(({ data }) => {
					waitDone()
					console.log(success('JSON Key successfully generated. Safely store the following credentials in a json file.'))
					console.log(' ')
					console.log(JSON.stringify(data, null, '  '))
					console.log(' ')
				})
				.catch(e => {
					waitDone()
					const er = JSON.parse(e.message)
					if (er.code == 429 && er.message && er.message.toLowerCase().indexOf('maximum number of keys on account reached') >= 0) {
						console.log(error('You\'ve reached the maximum number of keys you can add to a service account.'))
						console.log(info('To add a new JSON key to this service account, please delete an existing private key.'))
						console.log(info(`To delete an existing key, run ${cmd('neap rm')}`))
					} else 
						throw e
				})
		}
	})
})

const _addRolesToServiceAccount = (projectId, token, waitDone, svcAccounts, options) => Promise.resolve(null).then(() => {
	if (!svcAccounts || svcAccounts.length == 0)
		return 

	const keyOptions = svcAccounts.map((a,idx) => ({
		name: ` ${bold(idx+1)}. ${a.displayName} - ${a.email.split('@')[0]}`, value: idx
	}))

	let serviceAccountEmail
	return promptList({ message: 'Add roles to one of the following service accounts: ', choices: keyOptions, separator: false }).then(answer => {
		if (answer >= 0) {
			const v = svcAccounts[answer*1]
			serviceAccountEmail = v.email
			return  _chooseAccountRoles()
		}
		return false 
	})
		.then(roles => {
			if (roles) {
				return askQuestion(question(`Are you sure you want to add ${roles.length} role${roles.length > 1 ? 's' : ''} (Y/n) ? `)).then(yes => {
					if (yes == 'n')
						return						
					
					waitDone = wait(`Granting ${bold(serviceAccountEmail)} access to project ${bold(projectId)}`)
					return gcp.project.serviceAccount.roles.add(projectId, serviceAccountEmail, roles, token, options).then(() => {
						waitDone()
						console.log(success(`Access successfully granted to ${bold(serviceAccountEmail)} to access project ${bold(projectId)}`))
					})
				})
			}
		})
})

const _addServiceAccount = (projectId, token, waitDone, svcAccounts, options) => Promise.resolve(null).then(() => {

	let serviceAccountName
	return coreHelper.enterName('Enter a service account name: ', 'The service account name is required.')
		.then(name => {
			serviceAccountName = name 
			return askQuestion(question('Do you wish to add one or multiple roles to this service account (Y/n) ? ')).then(yes => {
				if (yes == 'n')
					return
				return _chooseAccountRoles()
			})
		})
		.then(roles => {
			return askQuestion(question('Are you sure you want to create this new service account (Y/n) ? ')).then(yes => {
				if (yes == 'n')
					return		
				
				const opts = roles && roles.length > 0 ? merge(options, { roles }) : options
				waitDone = wait('Creating a new service account...')
				return gcp.project.serviceAccount.create(projectId, serviceAccountName, serviceAccountName, token, opts)
					.then(() => {
						waitDone()
						console.log(success(`New service account successfully created in project ${bold(projectId)}\n`))
					})
			})
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


const _configureCronSchedule = () => Promise.resolve(null)
	.then(() => {
		const cronStyle = [
			{ name: 'every 10 hours', value: 1 },
			{ name: 'every 5 minutes from 10:05 to 15:25', value: 2 },
			{ name: 'every monday 17:46', value: 3 },
			{ name: '1st,3rd wednesday of month 19:23', value: 4 },
			{ name: '1,8,15,22 of month 09:00', value: 5 },
			{ name: '1st,3rd mon,wednesday,thu of sep,oct,nov 17:00', value: 6 },
			{ name: '1,8,15,22 of sep,oct,nov 17:00', value: 7 }
		]
		console.log(question('How often should the Cron job fire the service? '))
		return promptList({ message: 'Configure the frequency using one of the following template:', choices: cronStyle, separator: false })
	})
	.then(answer => {
		const timeUnits = [{ name: 'minutes', value: 'minutes' }, { name: 'hours', value: 'hours' }]
		let timeUnit, freq, start, end, day, days, months
		switch(answer){
		case 1:
			return promptList({ message: 'Choose a time unit:', choices: timeUnits, separator: false, noAbort: true })
				.then(answer => {
					timeUnit = answer
					return _chooseNumber('Enter a frequency number: ', { ge: 1 })
				})
				.then(answer => {
					freq = answer
					const schedule = `every ${freq} ${timeUnit}`
					return _confirmSchedule(schedule)
				})
		case 2:
			return promptList({ message: 'Choose a time unit:', choices: timeUnits, separator: false, noAbort: true })
				.then(answer => {
					timeUnit = answer
					return _chooseNumber('Enter a frequency number: ', { ge: 1 })
				})
				.then(answer => {
					freq = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					return _chooseTime(`Enter an end time using the format ${bold('HH:mm')} (ex: 22:45) : `)
				})
				.then(answer => {
					end = answer
					const schedule = `every ${freq} ${timeUnit} from ${start} to ${end}`
					return _confirmSchedule(schedule)
				})
		case 3:
			return _chooseWeekDay('Choose a day:')
				.then(answer => {
					day = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `every ${day} ${start}`
					return _confirmSchedule(schedule)
				})
		case 4:
			return _chooseWeekDay('Choose a day:', { exclEveryDay: true })
				.then(answer => {
					day = answer
					return _chooseWeekDayFreq(`Enter which ${bold(day)} of the month this Cron should fire your service. Use ',' to add multiple occurences (ex: 1st,3rd): `)
				})
				.then(answer => {
					freq = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${freq} ${day} of month ${start}`
					return _confirmSchedule(schedule)
				})
		case 5:
			return _chooseDayFreq('Enter which date of the month this Cron should fire your service. Use \',\' to add multiple dates (ex: 4,18,27): ')
				.then(answer => {
					days = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${days} of month ${start}`
					return _confirmSchedule(schedule)
				})
		case 6:
			return _chooseWeekDayFreqSeq('Enter which day of the month this Cron should fire your service. Use \',\' to add multiple days (ex: monday,wednesday): ')
				.then(answer => {
					days = answer
					return _chooseWeekDayFreq(`Enter which ${bold(days)} of the month this Cron should fire your service. Use ',' to add multiple occurences (ex: 1st,3rd): `)
				})
				.then(answer => {
					freq = answer
					return _chooseMonthFreqSeq('Enter which month of the year this Cron should fire your service. Use \',\' to add multiple occurences (ex: january,may): ')
				})
				.then(answer => {
					months = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${freq} ${days} of ${months} ${start}`
					return _confirmSchedule(schedule)
				})
		case 7:
			return _chooseDayFreq('Enter which date of the month this Cron should fire your service. Use \',\' to add multiple dates (ex: 4,18,27): ')
				.then(answer => {
					freq = answer
					return _chooseMonthFreqSeq('Enter which month of the year this Cron should fire your service. Use \',\' to add multiple occurences (ex: january,may): ')
				})
				.then(answer => {
					months = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${freq} of ${months} ${start}`
					return _confirmSchedule(schedule)
				})
		default:
			return null
		}
	})

const _chooseEmail = (q, r, options={}) => askQuestion(question(q)).then(answer => {
	if (!answer && options.default)
		return options.default
	else if (!answer) {
		console.log(error(r))
		return _chooseEmail(q, r, options)
	} else if (validate.email(answer)) {
		if (options.blacklist && options.blacklist.length > 0) {
			const email = answer.toLowerCase().trim()
			if (options.blacklist.some(e => e && e.toLowerCase().trim() == email)) {
				console.log(error('This email is already used by an existing Collaborator'))
				return _chooseEmail(q, r, options)
			}
		}
		return answer
	}
	else {
		console.log(error('Invalid email.'))
		return _chooseEmail(q, r, options)
	}
})

const _chooseDomain = (q) => askQuestion(question(q)).then(n => {
	if (!n) {
		console.log(error('The domain is required. Please enter one (e.g., neapup.co)'))
		return _chooseDomain(q)
	} else {
		n = n.trim()
		if (/:\/\//.test(n)) {
			console.log(error('Invalid domain name. Enter domain only. Do not include any protocol (e.g., neapup.co)'))
			return _chooseDomain(q)
		} else
			return n
	}
})

const _chooseWebsite = (q) => askQuestion(question(q)).then(n => {
	if (!n) {
		console.log(error('The website is required. Please enter one (e.g., https://neapup.co)'))
		return _chooseDomain(q)
	} else {
		n = n.trim()
		if (/^(https|http):\/\//.test(n)) 
			return n
		else {
			console.log(error('Invalid website. You must include the protocol (i.e., http:// or https://). Example: https://neapup.co'))
			return _chooseDomain(q)
		} 
	}
})

/**
 * [description]
 * @param  {[type]} q       			[description]
 * @param  {Object} options.default 	[description]
 * @param  {Array} 	options.range 		[description]
 * @param  {Number} options.ge 			[description]
 * @param  {Number} options.gt 			[description]
 * @return {[type]}         			[description]
 */
const _chooseNumber = (q, options={}) => askQuestion(question(q)).then(n => {
	if (options.default && n !== 0 && !n)
		return options.default

	const nbr = n * 1
	if (n === '' || typeof(nbr) != 'number') {
		console.log(error(`'${n}' is not a number`))
		return _chooseNumber(q, options)
	} else if (options.range && typeof(options.range[0]) == 'number' && typeof(options.range[1]) == 'number' && (nbr < options.range[0] || nbr > options.range[1])) {
		console.log(error(`'${n}' must be defined between ${bold(options.range[0])} and ${bold(options.range[1])}`))
		return _chooseNumber(q, options)
	} else if (options.range && typeof(options.ge) == 'number' && nbr < options.gt) {
		console.log(error(`'${n}' must be greater than or equal to ${bold(options.ge)}`))
		return _chooseNumber(q, options)
	} else  
		return nbr
})

const _chooseWeekDay = (q, options={}) => {
	const weekDays = options.exclEveryDay ? [] : [{ name: 'every day', value: 'day' }]
	weekDays.push(...[
		{ name: 'monday', value: 'monday' },
		{ name: 'tuesday', value: 'tuesday' },
		{ name: 'wednesday', value: 'wednesday' },
		{ name: 'thursday', value: 'thursday' },
		{ name: 'friday', value: 'friday' },
		{ name: 'saturday', value: 'saturday' },
		{ name: 'sunday', value: 'sunday' }
	])

	return promptList({ message: q, choices: weekDays, separator: false, noAbort: true })
}

const VALID_DAY_FREQ = { '1st': true, '2nd': true, '3rd': true, '4th': true }
const _chooseWeekDayFreq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one day frequency. Choose either 1st, 2nd, 3rd or 4th'))
			return _chooseWeekDayFreq(q)
		} else {
			const freq = answer.split(',').map(x => x.trim())
			const invalidFreq = freq.filter(f => !VALID_DAY_FREQ[f])
			if (invalidFreq.length > 0) {
				console.log(error(`Invalid day frequency: ${invalidFreq.join(', ')}. Choose either 1st, 2nd, 3rd or 4th`))
				return _chooseWeekDayFreq(q)
			} else
				return collection.sortBy(freq, x => x).join(',')
		}
	})

const VALID_WEEKDAY_FREQ = { 
	'monday': '1_mon', 'mon': '1_mon', 
	'tuesday': '2_tue', 'tue': '2_tue',
	'wednesday': '3_wed', 'wed': '3_wed',
	'thursday': '4_thu', 'thu': '4_thu',
	'friday': '5_fri', 'fri': '5_fri',
	'saturday': '6_sat', 'sat': '6_sat',
	'sunday': '7_sun', 'sun': '7_sun'
}
const _chooseWeekDayFreqSeq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one day. Choose either mon, tue, wed, thu, fri, sat, or sun'))
			return _chooseWeekDayFreqSeq(q)
		} else {
			const freq = answer.split(',').map(x => x.trim())
			const invalidFreq = freq.filter(f => !VALID_WEEKDAY_FREQ[f])
			if (invalidFreq.length > 0) {
				console.log(error(`Invalid days: ${invalidFreq.join(', ')}. Choose either mon, tue, wed, thu, fri, sat, or sun`))
				return _chooseWeekDayFreqSeq(q)
			} else 
				return Object.keys(collection.sortBy(freq.map(f => VALID_WEEKDAY_FREQ[f]), x => x).reduce((acc,d) => {
					acc[d.split('_')[1]] = true
					return acc
				}, {})).join(',')
		}
	})

const VALID_MONTH_FREQ = { 
	'january': '01_jan', 'jan': '01_jan', 
	'february': '02_feb', 'feb': '02_feb',
	'march': '03_mar', 'mar': '03_mar',
	'april': '04_apr', 'apr': '04_apr',
	'may': '05_may',
	'june': '06_jun', 'jun': '06_jun',
	'july': '07_jul', 'jul': '07_jul',
	'august': '08_aug', 'aug': '08_aug',
	'september': '09_sep', 'sep': '09_sep',
	'october': '10_oct', 'oct': '10_oct',
	'november': '11_nov', 'nov': '11_nov',
	'december': '12_dec', 'dec': '12_dec'
}
const _chooseMonthFreqSeq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one month. Choose either jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, or dec'))
			return _chooseMonthFreqSeq(q)
		} else {
			const freq = answer.split(',').map(x => x.trim())
			const invalidFreq = freq.filter(f => !VALID_MONTH_FREQ[f])
			if (invalidFreq.length > 0) {
				console.log(error(`Invalid months: ${invalidFreq.join(', ')}. Choose either jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, or dec`))
				return _chooseMonthFreqSeq(q)
			} else 
				return Object.keys(collection.sortBy(freq.map(f => VALID_MONTH_FREQ[f]), x => x).reduce((acc,d) => {
					acc[d.split('_')[1]] = true
					return acc
				}, {})).join(',')
		}
	})

const _chooseDayFreq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one day of the month. Enter a number between 1 and 31'))
			return _chooseDayFreq(q)
		} else {
			const days = answer.split(',').map(x => x.trim()*1)
			const invalidDays = days.filter(day => typeof(day) != 'number' || day < 1 || day > 31)
			if (invalidDays.length > 0) {
				console.log(error(`Invalid days: ${invalidDays.join(', ')}. Choose a number or a comma separated sequence of numbers between 1 and 31`))
				return _chooseDayFreq(q)
			} else
				return collection.sortBy(days, x => x).join(',')
		}
	})

const _chooseTime = q => askQuestion(question(q)).then(n => {
	const [ hour, minute ] = (n || '').split(':').filter(x => typeof(x.trim()*1) == 'number').map(x => x.trim()*1)
	if (typeof(hour) != 'number' || typeof(minute) != 'number') {
		console.log(error(`'${n}' is not a valid time`))
		return _chooseTime(q)
	} else if (hour < 0 || hour > 23) {
		console.log(error(`hours can only be between 0 and 23. ${hour} is invalid.`))
		return _chooseTime(q)
	} else if (minute < 0 || minute > 59) {
		console.log(error(`minutes can only be between 0 and 59. ${minute} is invalid.`))
		return _chooseTime(q)
	} else {
		const formattedHour = hour < 10 ? `0${hour}` : `${hour}`
		const formattedMinute = minute < 10 ? `0${minute}` : `${minute}`
		return `${formattedHour}:${formattedMinute}`
	}
})

const _confirmSchedule = schedule => {
	console.log(info(`You're about to save this schedule: ${bold(schedule)}`))
	return askQuestion(question('Are you sure yo want to continue (Y/n) ? '))
		.then(answer => {
			if (answer == 'n')
				return _configureCronSchedule()
			else
				return schedule
		})
}

const _chooseTimeZone = () => {
	const systemTz = timezone.system()
	const choices = [
		{ name: `User your current time zone (${bold(systemTz)})`, value: 'system' },
		{ name: 'Use UTC/GMT', value: 'utc' },
		{ name: 'User another time zone', value: 'tz' }
	]

	return promptList({ message: 'Which time zone does your schedule use?', choices, separator: false, noAbort: true })
		.then(answer => {
			if (answer == 'system')
				return systemTz
			else if (answer == 'utc')
				return null
			else {
				const timeZones = timezone.all()
				const filterTz = (input, tzs) => (tzs || []).filter(tz => tz && tz.toLowerCase().indexOf((input || '').toLowerCase()) >= 0)
				return searchAnswer('Search all time zones: ', timeZones, filterTz)
			}
		})
}

/**
 * [description]
 * @param  {Boolean} options.required 	[description]
 * @return {[type]}         			[description]
 */
const _chooseAccountRoles = (options={}) => (options.roles ? Promise.resolve(options.roles) : gcp.project.serviceAccount.roles.get(options)).then(roles => {
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
			const _roles = (roles || []).filter(r => !answers.some(a => a == r))
			return _chooseAccountRoles(merge(options, { roles: _roles })).then(otherRoles => {
				const totals = [...answers, ...(otherRoles || [])]
				return collection.uniq(totals)
			})
		})
	})
})

/**
 * Input: rate: 3, unit 'seconds' => Output: 20/m (i.e., 20 times per minute)
 * @param  {[type]} rate [description]
 * @param  {[type]} unit [description]
 * @return {[type]}      [description]
 */
const _formatTaskRateForGoogle = (rate, unit) => {
	if (!rate)
		throw new Error('Missing required argument \'rate\'.')
	rate = rate * 1
	
	if (typeof(rate) != 'number')
		throw new Error('Wrong argument exception. \'rate\' must be a number.')

	if (rate <= 0)
		throw new Error('Wrong argument exception. \'rate\' must be strictly greater than zero.') 

	switch (unit) {
	case 'milliseconds':
		return _convertMillisecondsIntervalToSecondsFrequency(rate)
	case 'seconds':
		return _convertSecondsIntervalToMinutesFrequency(rate)
	case 'minutes':
		return _convertMinutesIntervalToHoursFrequency(rate)
	case 'hours':
		return _convertHoursIntervalToDaysFrequency(rate)
	case 'days':
		return _convertDaysIntervalToDaysFrequency(rate)
	default:
		throw new Error(`Invalid argument exception. Time unit '${unit}' can't be converted to a unit understood by Google Cloud Task API.`)
	}
}

const _convertMillisecondsIntervalToSecondsFrequency = i => {
	const r = 1000/i 
	if (r >= 1)
		return `${Math.round(r)}/s`
	else 
		return _convertSecondsIntervalToMinutesFrequency(i/1000)
}

const _convertSecondsIntervalToMinutesFrequency = i => {
	if (i == 1)
		return '1/s'
	const r = 60/i 
	if (r >= 1)
		return `${Math.round(r)}/m`
	else 
		return _convertMinutesIntervalToHoursFrequency(i/60)
}

const _convertMinutesIntervalToHoursFrequency = i => {
	if (i == 1)
		return '1/m'
	const r = 60/i 
	if (r >= 1)
		return `${Math.round(r)}/h`
	else 
		return _convertHoursIntervalToDaysFrequency(i/60)
}

const _convertHoursIntervalToDaysFrequency = i => {
	if (i == 1)
		return '1/h'
	const r = 24/i 
	if (r >= 1)
		return `${Math.round(r)}/d`
	else 
		return _convertDaysIntervalToDaysFrequency(i/24)
}

const _convertDaysIntervalToDaysFrequency = i => {
	if (i == 1)
		return '1/d'
	const r = 1/i 
	if (r >= 1)
		return `${Math.round(r)}/d`
	else 
		return `${r.toFixed(2)*1}/d`
}

const _formatScheduleForGoogle = schedule => 
	(schedule || '')
		.replace(/tue\s/g, 'tuesday ')
		.replace(/tue,/g, 'tuesday,')
		.replace(/thu\s/g, 'thursday ')
		.replace(/thu,/g, 'thursday,')

const _getAppJsonFiles = (options={}) => file.getJsonFiles(options.projectPath, options)
	.catch(() => [])
	.then(jsonFiles => jsonFiles.map(x => path.basename(x)).filter(x => x.match(/^app\./) && (x.split('.').length == 3 || x.split('.').length == 2)))

const _selectGoogleApis = apis => apis ? Promise.resolve(apis) : api.get()
	.then(apis => {
		const answers = []
		const choices = [{ name: ' 1. all', value: 'all' }, ...apis.map((a,idx) => ({ name: ` ${idx+2}. ${a}`, value: a }))]
		return promptList({ message: 'Which Google API do you want to enable? ', choices, separator: false }).then(answer => {
			if (!answer)
				return 
			else if (answer == 'all')
				return answer 

			answers.push(answer)
			return askQuestion(question('Do you want to add another API (Y/n) ? ')).then(yes => {
				if (yes == 'n')
					return answers

				const rest = apis.filter(a => a != answer)
				return _selectGoogleApis(rest).then(selectedApis => {
					if (!selectedApis)
						return answers
					else if (selectedApis == 'all')
						return selectedApis

					return [...answers, ...selectedApis]
				})
			})
		})
	})

module.exports = {
	add: addStuffs,
	_: {
		formatTaskRateForGoogle: _formatTaskRateForGoogle
	}
}




