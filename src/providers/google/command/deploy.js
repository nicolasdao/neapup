/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const path = require('path')
const clipboardy = require('clipboardy')
const gcp = require('../gcp')
const { error, wait, success, link, bold, info, note, warn, askQuestion, question, debugInfo, cmd, promptList } = require('../../../utils/console')
const { zipToBuffer, getAppJsonFiles, exists: fileExists, checkStandardEnvFilesQuotas } = require('../../../utils/files')
const { promise, date, obj, collection }  = require('../../../utils')
const utils = require('../utils')
const projectHelper = require('../project')
const getToken = require('../getToken')
const { hosting: appHostingHelper, appJson: appJsonHelper } = require('../config')

const FLEX_SERVICE_API = 'appengineflex.googleapis.com'
const QUOTAS_URL = 'https://console.cloud.google.com/iam-admin/quotas'

/**
 * [description]
 * @param  {Object}   options.hostingConfig 		[description]
 * @param  {Boolean}  options.overrideAppConfig   [description]
 * @param  {String}   options.env             	[description]
 * @param  {Boolean}  options.debug             [description]
 * @param  {Boolean}  options.promote           [description]
 * @param  {String}   options.projectPath       [description]
 * @param  {String}   options.serviceName       [description]
 * @return {[type]}                     		[description]
 */
const deploy = (options={}) => Promise.resolve(null).then(() => {
	options.deploying = true
	if (options.promote === undefined) 
		options.promote = true
	options.projectPath = projectHelper.getFullPath(options.projectPath)
	let waitDone = () => null
	let service = { name: (options.serviceName || 'default') }

	//////////////////////////////
	// 1. Show current project and app engine details to help the user confirm that's the right one.
	//////////////////////////////
	return getAppJsonFiles(options.projectPath, options)
		.then(appDotJsons => {
			if (!options.env) {
				// 1.1. Help the user choose between multiple app.<env>.json files
				if (appDotJsons && appDotJsons.length > 0) {
					if (options.chooseAppJson && appDotJsons.some(x => x == 'app.json'))
						options.env = null
					else if (appDotJsons.length == 1)
						options.env = appDotJsons[0] == 'app.json' ? null : appDotJsons[0].match(/app\.(.*?)\.json/)[1]
					else {
						const choices = appDotJsons.map(x => ({ 
							name: x, 
							value: x,
							commandOption: x == 'app.json' ? '--env' : `--env ${x.match(/app\.(.*?)\.json/)[1]}`
						}))
						const formattedChoices = choices.map((x, idx) => ({
							name: ` ${idx+1}. ${x.name} [${x.commandOption}]`,
							value: x.value
						}))
						return promptList({ message: 'Which config should be deployed?', choices: formattedChoices, separator: false }).then(answer => {
							if (!answer)
								process.exit()
							options.env = answer == 'app.json' ? null : answer.match(/app\.(.*?)\.json/)[1]
						})
					}
				}
			}
		})
		// 1.2. Test of the 'options.env' exists. If not, then suggest to carry on with the app.json or abort
		.then(() => _testEnv(options.projectPath, options))
		.then(() => utils.project.confirm(options))
		// .then(({ token, projectId, locationId, service: svcName }) => {
		// 	return gcp.app.get('cron-test2-xnm97', token).then(res =>{
		// 		console.log(JSON.stringify(res.data, null, ' '))
		// 		throw new Error('cdccwc')
		// 	})
		// })
		// .then(({ token, projectId, locationId, service: svcName }) => {
		// 	return gcp.project.serviceAccount.key.generate('cron-task-silit', 'neap-task-ll53oozti@cron-task-silit.iam.gserviceaccount.com', '107474207518467189331', token).then(res =>{
		// 		console.log(JSON.stringify(res.data, null, ' '))
		// 		throw new Error('cdccwc')
		// 	})
		// })
		// .then(({ token, projectId, locationId, service: svcName }) => {
		// 	const cronJobs = []
		// 	//return gcp.app.cron.get('cron-test-izelv', token, { confirm: true })
		// 	return gcp.app.cron.update('cron-test-izelv', cronJobs, token, { confirm: true })
		// 	.then(() => gcp.app.cron.get('cron-test-izelv', token))
		// 	.then(({ data }) => {
		// 		console.log(JSON.stringify(data, null, '  '))
		// 		throw new Error('ddqdqwe')
		// 	})
		// })
		.then(({ token, projectId, locationId, service: svcName }) => {
			if (svcName && service.name != svcName)
				service.name = svcName
			service.version = `v${date.timestamp({ short:false })}`

			let { bucket, zip } = _initDeploymentAssets(projectId, service.version)
			let deployStart, deployingToFlex

			const fileName = options.env ? `app.${options.env}.json` : 'app.json'
			console.log(info(`Deploying app (${bold(fileName)} config) to service ${bold(service.name)} in project ${bold(projectId)} ${locationId ? `(${locationId}) ` : ''}`))

			//////////////////////////////
			// 2. Zip project 
			//////////////////////////////
			return appJsonHelper.get(options.projectPath, options)
				.then(appJsonConfig => {
					// 2.1. Create app.yaml for flexible environment 
					appJsonConfig = appJsonConfig || {}
					const hostConfig = appJsonConfig.hosting || {}
					options.costReduction = hostConfig['cost-reduction']
					const hostingEnv = (hostConfig.env || '').trim().toLowerCase()
					const fName = hostConfig.env ? `app.${hostConfig.env}.json` : 'app.json'
					deployingToFlex = hostingEnv == 'flex' || hostingEnv == 'flexible' 
					// 2.2. If the target is a standard env, then make sure that all script.scriptPath are set to 'auto'. That's
					// 		a Google constraint
					if (!deployingToFlex && hostConfig.handlers && hostConfig.handlers.some(x => x))
						hostConfig.handlers.forEach(h => {
							if (h.script && h.script.scriptPath)
								h.script.scriptPath = 'auto'
						})

					const extraFiles = { 
						files: [
							{ name: 'app.yaml', content: appHostingHelper.toYaml(obj.merge(hostConfig, { runtime: 'nodejs' })) },
							{ name: 'app.json', content: JSON.stringify(appJsonConfig, null, ' ') }
						]
					} 
					// 2.3. Check quotas for Standard env.
					const checkQuotas = deployingToFlex || (hostConfig.ignore && hostConfig.ignore['quotas-warning'])
						? Promise.resolve(null)
						: Promise.resolve(null).then(() => {
							waitDone = wait('Checking project does not exceed the Standard environment quotas...')
							return checkStandardEnvFilesQuotas(options.projectPath)
								.catch(e => {
									waitDone()
									console.log(warn(e.message))
									if (e.folders) {
										console.log(info('Folders exceeding limit:'))
										e.folders.forEach(x => console.log(`  - ${x.folder}: ${x.files}`))
									}

									return askQuestion(question('Do you wish to continue (Y/n) ? ')).then(yes => {
										if (yes == 'n')
											process.exit()

										console.log(note(`To ignore this warning next time, add this config to your ${bold(fName)}: "hosting": { "ignore": { "quotas-warning": true } }`))
										return { error: true }
									})
								})
								.then(res => {
									waitDone()
									if (!res || !res.error)
										console.log(success('Project respects Standard environment limits'))
								})
						})

					// 2.4. Zip
					return checkQuotas.then(() => {
						const msg = hostConfig.build ? 'Re-building & zipping project...' : 'Zipping project...'
						waitDone = wait(msg)
						return zipToBuffer(options.projectPath, obj.merge(options, extraFiles, { build: hostConfig.build }))
					})
				})
				.then(({ filesCount, buffer }) => {
					waitDone()
					console.log(success(`Nodejs app (${filesCount} files) successfully zipped.`))
					zip.file = buffer
					_updateDeploymentId(service, bucket, zip, filesCount)
				}).catch(e => { waitDone(); throw e })
				//////////////////////////////
				// 3. Create bucket & Check that the 'default' service exists
				//////////////////////////////
				.then(() => {
					const bucketTask = _createBucket(bucket.projectId, bucket.name, token, options).catch(e => ({ _error: e }))
					const testDefaultServiceExistsTask = service.name == 'default' 
						? Promise.resolve({ data: true })
						: gcp.app.service.get(bucket.projectId, 'default', token, { debug: options.debug, verbose: false }).catch(e => ({ _error: e }))
					return Promise.all([bucketTask, testDefaultServiceExistsTask]).then(values => {
						const e = values.find(v => v && v._error) 
						if (e)
							throw e._error
						// 3.1. There is no 'default' 
						if (!values[1].data) {
							console.log(info(`No 'default' service defined yet. Choosing the 'default' service to deploy the app rather than '${service.name}' (this is a Google Cloud Platform constraint).`))
							service.name = 'default'
						}
					})
				})
				//////////////////////////////
				// 4. Upload zip to bucket
				//////////////////////////////
				.then(() => {
					const s = zip.file.length
					let unit = 'MB'
					let zipSize = (s/1024/1024).toFixed(2)
					if (zipSize * 1 < 1) {
						zipSize = (s/1024).toFixed(2)
						unit = 'KB'
					}
					const uploadStart = Date.now()
					waitDone = wait(`Uploading nodejs app (${zipSize}${unit}) to bucket`)
					return gcp.bucket.uploadFile(bucket.projectId, bucket.name, { name: zip.name, content: zip.file }, token, options)
						.then(() => {
							waitDone()
							console.log(success(`App (${zipSize}${unit}) successfully uploaded to bucket in ${((Date.now() - uploadStart)/1000).toFixed(2)} seconds.`))
						})
						.catch(e => { waitDone(); throw e })
				})	
				//////////////////////////////
				// 5. Make sure the Flexible Service API is enabled
				//////////////////////////////
				.then(() => {
					if (deployingToFlex) {
						waitDone = wait(`Checking that the App Engine Flexible service API has been enabled in project ${bold(bucket.projectId)}`)
						return gcp.serviceAPI.exists(FLEX_SERVICE_API, bucket.projectId, token, options).then(res => {
							waitDone()
							if (!res || !res.data) { // App Engine Flexible service API not enabled yet
								console.log(info(`App Engine Flexible service API is not yet enabled in project ${bucket.projectId}`))
								waitDone = wait('Enabling App Engine Flexible service API')
								return gcp.serviceAPI.enable(FLEX_SERVICE_API, bucket.projectId, token, obj.merge(options, { confirm: true })).then(() => {
									waitDone()
									console.log(success('App Engine Flexible service API successfully enabled'))
								})
							}
						}).catch(e => {
							waitDone()
							console.log(error('Fail to determine if the App Engine Flexible service API is enabled.', e.message, e.stack))
							console.log(info('This API must be enabled to deploy to an App Engine FLEXIBLE environment.'))
							console.log(info(`Try to deploy again, or manually enable that API by going to ${link(`https://console.cloud.google.com/apis/library/appengineflex.googleapis.com?q=flexible&project=${bucket.projectId}`)}`))
							throw new Error('Fail to determine if the App Engine Flexible service API is enabled.')
						})
					}
				})
				//////////////////////////////
				// 6. Deploying project
				//////////////////////////////
				.then(() => {
					deployStart = Date.now()
					return _deployApp(bucket, zip, service, token, waitDone, obj.merge(options))
				})
				////////////////////////////////////
				// 7. Checking deployment status
				////////////////////////////////////
				.then(({ operationId, waitDone: done }) => {
					waitDone = done
					return utils.operation.checkBuild(
						bucket.projectId, 
						operationId, 
						token, 
						() => waitDone(), 
						(data) => {
							waitDone()
							const buildId = ((data.metadata || {}).createVersionMetadata || {}).cloudBuildId
							const moreInfoLink = buildId
								? `https://console.cloud.google.com/cloud-build/builds/${buildId}?project=${bucket.projectId}`
								: `https://console.cloud.google.com/appengine/versions?project=${projectId}&serviceId=${service.name}`
							console.log(error('Fail to deploy. An error occured during the deployment to App Engine'))
							console.log(info(`For more details about this error, go to ${bold(link(moreInfoLink))}`))
							console.log(info('Error details:'))
							console.log(JSON.stringify(data, null, '  '))
							console.log(info(`For more details about this error, go to ${bold(link(moreInfoLink))}`))
							throw new Error('Deployment failed.')
						}, 
						obj.merge(options, { interval: 4 * 1000, timeOut: 5 * 60 * 1000 }))
						.then(res => ({ status: res.status, data: res.data, operationId }))
						.catch(e => {
							if (options.promote && (e.message || '').toLowerCase().indexOf('timeout') >= 0) {
								console.log(info('We didn\'t have enough time to determine whether or not this deployment succeeded.'))
								console.log(info(`To manually confirm, go to ${link(`https://console.cloud.google.com/appengine/versions?project=${projectId}&serviceId=${service.name}`)} and look for version ${bold(service.version)}`))
								console.log(info('If this deployment is operational, the link above will also allow you to migrate traffic this version'))
							}
							throw e
						})
				})
				.then(({ operationId, data }) => {
					const versionUrl = data && data.response && data.response.versionUrl ? data.response.versionUrl : `https://${service.version}-dot-${service.name}-dot-${projectId}.appspot.com`
					console.log(success(`App successfully deployed in project ${bold(bucket.projectId)} in App Engine's service ${bold(service.name)} (version: ${service.version}) in ${((Date.now() - deployStart)/1000).toFixed(2)} seconds.`))
					return { 
						operationId, 
						versionUrl,
						serviceUrl: versionUrl.replace(`https://${service.version}-dot-`, 'https://').replace('https://default-dot-', 'https://')
					}
				})
				////////////////////////////////////
				// 8. Confirming deployment ready for traffic migration (only for flexible engine)
				////////////////////////////////////
				.then(({ operationId, versionUrl, serviceUrl }) => {
					const checkStart = Date.now()
					if (options.promote && deployingToFlex) {
						const msgs = [
							`Confirming this deployment is ready to receive traffic from ${link(serviceUrl)}`,
							'Please be patient, this could take more than 5 min.'
						] 
						waitDone = wait(msgs.join('\n  '))
						return utils.operation.check(
							bucket.projectId, 
							operationId, 
							token, 
							() => waitDone(), 
							(data) => {
								console.log(error(`Fail to confirm this deployment can accept traffic from ${link(serviceUrl)}. Details:`, JSON.stringify(data, null, '  ')))
								console.log(info(`For more details about this deployment, go to ${link(`https://console.cloud.google.com/appengine/versions?project=${projectId}&serviceId=${service.name}`)}`))
								throw new Error('Deployment failed.')
							}, 
							obj.merge(options, { timeOut: 10 * 60 * 1000 })) // 10 min. timeout
							.then(res => ({ status: res.status, data: res.data, operationId }))
							.then(({ operationId, data }) => {
								const versionUrl = data && data.response && data.response.versionUrl ? data.response.versionUrl : `https://${service.version}-dot-${service.name}-dot-${projectId}.appspot.com`
								console.log(success(`Deployment ready to accept traffic (confirmed in ${((Date.now() - checkStart)/1000).toFixed(2)} seconds)`))
								return { 
									operationId, 
									versionUrl,
									serviceUrl: versionUrl.replace(`https://${service.version}-dot-`, 'https://').replace('https://default-dot-', 'https://')
								}
							})
					} else 
						return { operationId, serviceUrl, versionUrl }
				})
				////////////////////////////////////
				// 9. Migrating traffic
				////////////////////////////////////
				.then(({ serviceUrl, versionUrl }) => {
					if (options.promote) {
						waitDone = wait(`Migrating traffic from ${serviceUrl} to this version`)
						// 7.1. Checking which service version is currently serving all traffic.
						if (options.debug) console.log(debugInfo('Checking which service version serves traffic'))
						return gcp.app.service.get(bucket.projectId, service.name, token, options)
							.then(({ data }) => {
								service.currentVersions = data && data.split && data.split.allocations
									? Object.keys(data.split.allocations)
									: [] // this means this is the first time we deploy
								const deployingToExistingVersion = service.currentVersions.some(version => version == service.version)
								// console.log({
								// 	currentVersions: service.currentVersions,
								// 	deployingToExistingVersion,
								// 	data: JSON.stringify(data, null, ' ')
								// })
								if (options.debug) console.log(debugInfo(`Current allocation: ${data.split.allocations}`))
								if (service.currentVersions.length > 0 && !deployingToExistingVersion) {
									// 7.1.1. The current service version is different from the newly deployed. Time to migrate traffic...
									if (options.debug) console.log(debugInfo('Migrating traffic now'))
									return gcp.app.service.version.migrateAllTraffic(bucket.projectId, service.name, service.version, token, options)
										.then(({ data }) => promise.check(
											() => gcp.app.getOperationStatus(bucket.projectId, data.operationId, token, options).catch(e => {
												console.log(error(`Unable to verify deployment status. Manually check the status of your build here: ${link(`https://console.cloud.google.com/cloud-build/builds?project=${bucket.projectId}`)}`))
												throw e
											}), 
											({ data }) => {
												if (data && data.done) {
													waitDone()
													return true
												}
												else if (data && data.message) {
													console.log(error(`Fail to migrate traffic to version ${bold(service.version)}. Details:`, JSON.stringify(data, null, '  ')))
													throw new Error('Traffic migration failed.')
												} else 
													return false
											}))
								}
								// 7.1.2. The current service version is the same as the new version. That means that the new version is already serbing all the traffic.
							})
							.then(() => {
								waitDone()
								return clipboardy.write(serviceUrl).then(() => {
									console.log(success('Traffic successfully migrated to new version.'))
									console.log(success(`App available at ${bold(link(serviceUrl))} (copied to clipboard)`))
								})
							})
					} else
						return clipboardy.write(versionUrl).then(() => {
							console.log(success(`App available at ${bold(link(versionUrl))} (copied to clipboard)`))
						})
				})
				////////////////////////////////////
				// 10. More info message
				////////////////////////////////////
				.then(() => console.log(note(`More details about this deployment in your Google Cloud Dashboard: ${link(`https://console.cloud.google.com/appengine/versions?project=${bucket.projectId}&serviceId=${service.name}`)}\n`)))
				////////////////////////////////////
				// 11. Potentially stop the previous deployment
				////////////////////////////////////
				.then(() => {
					// 11.1. Checking if previous versions might unnecessarily incur cost
					waitDone = wait('Checking if previous versions might unnecessarily incur cost')
					return getToken(options).then(token => gcp.app.service.version.list(bucket.projectId, service.name, token, options))
						.then(({ data }) => {
							waitDone()
							const billableVersions = (data.versions || [])
								.map(version => ({
									id: version.id,
									notCurrent: version.id != service.version,
									isServingFlex: version.env && version.env != 'standard' && version.servingStatus == 'SERVING',
									autoScalingHasServingMinInstances: version.automaticScaling && (version.automaticScaling.minIdleInstances > 0 || (version.automaticScaling.standardSchedulerSettings && version.automaticScaling.standardSchedulerSettings.minInstances > 0)) && version.servingStatus == 'SERVING',
									isServingBasicScaling: version.basicScaling && version.servingStatus == 'SERVING',
									isServingManualScaling: version.manualScaling && version.servingStatus == 'SERVING',
									createTime: version.createTime,
									createdBy: version.createdBy
								}))
								.filter(v => v.notCurrent && (v.isServingFlex || v.autoScalingHasServingMinInstances || v.isServingBasicScaling || v.isServingManualScaling))
								.map(v => {
									const head = `${bold(v.id)} created by ${v.createdBy} on ${v.createTime}`
									v.reason = 
										v.isServingFlex ? { msg: `${head} is flexible and still serving.`, fix: `${bold('To fix this')}, simply stop this version.` } : 
											v.autoScalingHasServingMinInstances ? { msg: `${head} has a min. set of instances in auto-scaling mode which are always running and still serving.`, fix: `${bold('To fix this')}, set both the min. set of instances and the min. set of idle instances to zero.` } :
												v.isServingBasicScaling ? { msg: `${head} is in basic-scaling mode and still serving.`, fix: `${bold('To fix this')}, simply stop this version.` } :
													{ msg: `${head} is in manual-scaling mode and still serving.`, fix: `${bold('To fix this')}, simply stop this version.` }
									
									return v
								})
							return billableVersions
						})
				})
				.then(billableVersions => {
					const moreInfoLink = link(`https://console.cloud.google.com/appengine/versions?project=${bucket.projectId}&serviceId=${service.name}`)
					if (billableVersions.length > 0) {
						// 11.2. Stopping 
						const indent = '   '
						const versionLabel = billableVersions.length > 1 ? 'versions' : 'version'
						console.log(info(`The following older ${versionLabel} ${billableVersions.length > 1 ? 'are' : 'is'} still probably incurring a cost:`))
						billableVersions.forEach(version => {
							console.log(`${indent}- ${version.reason.msg}`)
							console.log(`${indent}  ${version.reason.fix}`)
						})
						return (options.costReduction ? Promise.resolve(null) : askQuestion(question('Do you want to fix this (Y/n) ? '))).then(yes => {
							if (yes == 'n') {
								console.log(info(`To double-check that Google is not charging you for nothing, go to ${moreInfoLink}`))
								return
							} else { 
								const stopStart = Date.now()
								waitDone = wait(`Attempting to reduce the cost of ${billableVersions.length} ${versionLabel} in service ${bold(service.name)}`)
								return Promise.all(billableVersions.map(version => 
									gcp.app.service.version.minimizeBilling(bucket.projectId, service.name, version.id, token, obj.merge(options, { confirm: true }))
										.catch(e => ({ error: e }))))
									.then(values => {
										waitDone()
										const err = values.filter(x => x.errors).map(x => x.errors)
										if (err.length > 1) {
											console.log(error(`Failed to reduce the cost of ${billableVersions.length > 1 ? 'one or many previous SERVING versions' : 'a previous SERVING version' } in service ${bold(service.name)}.`))
											console.log(warn(`The previous SERVING ${versionLabel} of service ${bold(service.name)} might still incur a cost, even though they're not serving traffic anymore.`))
											console.log(warn(`To manually fix this, go to ${moreInfoLink}`))
											throw err[0]
										} 
										console.log(success(`Successfully reduce the cost of ${billableVersions.length} ${versionLabel} in service ${bold(service.name)} in ${((Date.now() - stopStart)/1000).toFixed(2)} seconds.`))
										console.log(info(`To double-check that Google is not charging you for nothing, go to ${moreInfoLink}`))
										if (!options.costReduction)
											console.log(note(`To automatically perform this cost reduction next time, add this config to your app.json: ${bold('"hosting": { "cost-reduction": true }')}`))
										return
									})
							}
						})
					} else {
						console.log(info(`We couldn't find any previous versions that are still capable o serving traffic for service ${bold(service.name)}`))
						console.log(info(`To double-check that Google is not charging you for nothing, go to ${moreInfoLink}`))
					}
				})
				////////////////////////////////////
				// 12. Potentially save the app.json
				////////////////////////////////////
				.then(() => _testEnv(options.projectPath, obj.merge(options, { noPrompt: true })))
				.then(envExists => appHostingHelper.get(options.projectPath, options).then(hostingConfig => {
					hostingConfig = hostingConfig || {}
					const appProjectId = hostingConfig.projectId
					const appService = hostingConfig.service
					const envConfigDoesNotExistYet = options.env && !envExists
					const appJson = options.env ? `app.${options.env}.json` : 'app.json'
					const updateConfig = appProjectId && !envConfigDoesNotExistYet
					// 12.1. The app.json has changed
					if (envConfigDoesNotExistYet || projectId != appProjectId || service.name != appService) {
						const introMsg = updateConfig
							? 'This deployement configuration is different from the one defined in the app.json'
							: `If you don't want to answer all those questions next time, create an ${bold(appJson)} file in your app project.`
						const actionMessage = updateConfig
							? `Do you want to update the ${bold(appJson)} with this new configuration (Y/n)?`
							: `Do you want to create an ${bold(appJson)} file (Y/n)? `
					
						console.log(info(introMsg))
						return askQuestion(question(actionMessage)).then(answer => {
							if (answer == 'n')
								return
							else {
								return appHostingHelper.save({ projectId, service: service.name }, options.projectPath, options)
							}
						})
					} else
						return
				}))

		}).catch(e => {
			waitDone()
			console.log(error('Deployment failed!', e.message, e.stack))
			throw e
		})
})

/**
 * IMPORTANT - DO NOT MANUALLY CREATE THE BUCKET NAME OR ZIP NAME OUTSIDE OF THIS
 * FUNCTION. THESE CONVENTIONS ARE CRITICAL TO RESTORE FAILED DEPLOYMENTS!
 * @param  {[type]} serviceVersion [description]
 * @return {[type]}                [description]
 */
const _initDeploymentAssets = (projectId, serviceVersion) => {
	const deploymentId = `neapup-${serviceVersion}-filescount`.toLowerCase()
	return {
		bucket: { 
			name: deploymentId, 
			projectId 
		},
		zip: { 
			name: 'neapup.zip'
		}
	}
}

const _updateDeploymentId = (servive, bucket, zip, filesCount) => {
	zip.filesCount = filesCount
	if (bucket && bucket.name)
		bucket.name = bucket.name.replace('-filescount', `-${filesCount || 0}`)
	if (servive && servive.version)
		servive.version = `${servive.version}-${filesCount || 0}`
}


const _createBucket = (projectId, bucketName, token, options={}) => {
	const bucketCreationDone = wait('Creating new deployment bucket')
	return gcp.bucket.create(bucketName, projectId, token, { debug: options.debug, verbose: false })
		.then(() => {
			bucketCreationDone()
			console.log(success(`Bucket successfully created (${bucketName}).`))
		})
		.catch(e => { 
			bucketCreationDone()
			try {
				const er = JSON.parse(e.message)
				if (er.code == 403 && er.message.indexOf('absent billing account') >= 0) {
					return projectHelper.enableBilling(projectId, token, options).then(({ answer }) => {
						if (answer == 'n') throw e
						return _createBucket(projectId, bucketName, token, options)
					})
				}
			} catch(_e) { (() => null)(_e) }
			throw e 
		})
}

const _selectLessValuableVersions = (nbr, versions) => nbr > 1
	? collection.sortBy(versions, v => v.createTime, 'asc').slice(0, Math.round(nbr))
	: []

const _deleteAppVersions = (projectId, nbr=10, options={}) => getToken(options).then(token => {
	return gcp.app.service.list(projectId, token, obj.merge(options, { includeVersions:true }))
		.then(({ data: services }) => {
		// 1. Finding the versions ratios per services. 
		// 	  This service ratio is used to establich how many versions per service must be deleted
			const legitSvcs = services.map(s => ({
				name: s.id,
				versions: (s.versions || []).filter(v => !v.traffic)
			})).filter(x => x.versions && x.versions.length > 0)
			const allVersionsCount = legitSvcs.reduce((count, svc) => count + svc.versions.length, 0)
			// 2. Nominating the versions to be deleted based on these rules:
			// 		1. Must not serve traffic
			// 		2. Must be as old as possible
			const svcToBeCleaned = legitSvcs.map(svc => {
				const nbrOfVersionsToDelete = svc.versions.length/allVersionsCount*nbr
				const versions = _selectLessValuableVersions(nbrOfVersionsToDelete, svc.versions)
				return { name: svc.name, versions }
			}).filter(x => x.versions.length > 0).reduce((acc, svc) => {
				acc.push(...svc.versions.map(v => ({ version: v.id, service: svc.name })))
				return acc
			}, [])

			// 3. Delete less valuable versions
			const opsCount = svcToBeCleaned.length
			return Promise.all(svcToBeCleaned.map(({ version, service }) => 
				gcp.app.service.version.delete(projectId, service, version, token, options)
					.catch(e => ({ projectId, service, version, error: e })))
			)
			// 4. Confirm that at least 1 version has been deleted
				.then(values => {
					const failuresCount = values.filter(x => x.error).length
					if (opsCount - failuresCount == 0) {
						const er = (values[0] || {}).error
						throw new Error(`Failed to delete ${opsCount} unused App Engine Service's versions to allow for new deployments.\n${er.message}\n${er.stack}`)
					} 
					const opIds = values.filter(x => x.data && x.data.operationId).map(({ data }) => data.operationId)
					return opIds.reduce((check, opId) => check.then(status => {
						return status || utils.operation.check(projectId, opId, token, null, null, options)
							.then(res => res && !res.error ? 'ok' : null)
							.catch(() => null)
					}), Promise.resolve(null))
						.then(status => {
							if (!status)
								throw new Error(`Failed to delete ${opsCount} unused App Engine Service's versions to allow for new deployments.`)
						})
				})
		})
})

const _deployApp = (bucket, zip, service, token, waitDone, options={}) => {
	waitDone = wait(`Deploying nodejs app to project ${bold(bucket.projectId)} under App Engine's service ${bold(service.name)} version ${bold(service.version)}`)
	return appHostingHelper.get(options.projectPath, options).then(hostingConfig => {
		// Complying to the App Engine constraint for standard env
		if ((!hostingConfig.env || hostingConfig.env == 'standard') && hostingConfig.handlers && hostingConfig.handlers.some(x => x))
			hostingConfig.handlers.forEach(h => {
				if (h.script && h.script.scriptPath)
					h.script.scriptPath = 'auto'
			})
		return gcp.app.deploy(bucket.projectId, service.name, service.version, bucket.name, zip.name, zip.filesCount, token, obj.merge(options, { verbose: false, hostingConfig })).then(({ data }) => {
			if (!data.operationId) {
				const msg = 'Unexpected response. Could not determine the operationId used to check the deployment status.'
				console.log(error(msg))
				throw new Error(msg)
			}
			return { operationId: data.operationId, waitDone }
		}).catch(e => {
			waitDone()
			try {
				const er = JSON.parse(e.message)
				const quotasExceeded = er.code == 400 && (er.message || '').toLowerCase().indexOf('quotas were exceeded') >= 0
				if (quotasExceeded) {
					const quotas = (er.message.match(/.*quotas were exceeded(.*?)\s*$/) || [])[1]
					return clipboardy.write(QUOTAS_URL).then(() => {
						console.log(error(`Your Google Cloud Platform quotas have been exceeded${quotas})`))
						console.log(info('Here are 2 actions you could take to fix this glitch:'))
						console.log(`    1. Use the command ${cmd('neap clean')} to deactivate unused resources.`)
						console.log(`    2. OR, go to ${link(QUOTAS_URL)} (copied to clipboard) and click on the ${bold('EDIT QUOTAS')} button at the top to increase your quotas.`)
						process.exit()
					})
				} else {
					const versionsThreshold = (((er.message || '').match(/Your app may not have more than(.*?)versions/) || [])[1] || '').trim()
					if (!options.noCleaning && er.code == 400 && versionsThreshold) {
						console.log(warn(`The App Engine in project ${bucket.projectId} has exceeded the maximum amount of versions allowed (${versionsThreshold}).`))
						waitDone = wait('Freeing up a minimal amount of unused resources in your project.\n  Nothing is being deleted. We\'re just updating some versions config. so they stop wasting resources.')
						return _deleteAppVersions(bucket.projectId, 10, options).then(() => {
							waitDone()
							console.log(success('Project successfully freed from a few unused resources.'))
							console.log(info('Trying to re-deploy now'))
							return _deployApp(bucket, zip, service, token, waitDone, obj.merge(options, { noCleaning: true }))
						})
					}
				}

			} catch(_e) { (() => null)(_e) }

			throw e
		})
	})
}

const _testEnv = (projectPath, options={}) => options.env 
	? fileExists(path.join(projectPath, `app.${options.env}.json`)).catch(() => false).then(yes => {
		if (!options.noPrompt && !yes) {
			console.log(warn(`No ${bold(`app.${options.env}.json`)} config file found in your app.`))
			console.log(info(`You can create one with this command: ${cmd(`neap manage --env ${options.env}`)}`))
			console.log(info(`In the meantime, we can use your app.json now and create a new app.${options.env}.json after your deployment is over.`))
			return askQuestion(question('Do you want to continue (Y/n)? ')).then(answer => {
				if (answer == 'n')
					process.exit()
				return yes
			})
		} else
			return yes
	}) 
	: Promise.resolve(true)

module.exports = deploy



