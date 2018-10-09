/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const path = require('path')
const getToken = require('./getToken')
const authConfig = require('../../utils/authConfig')
const { askQuestion, bold, info, question, promptList, wait, success, error, link, warn, debugInfo } = require('../../utils/console')
const { promise, collection, obj, file } = require('../../utils')
const gcp = require('./gcp')
const projectHelper = require('./project')
const { hosting: appHosting, appJson: appJsonHelper } = require('./config')
const { getHandlers } = require('./deploy')

const ALT_QUESTION = (env) => `Configure another setting in the ${env ? `app.${env}.json` : 'app.json'}:`

/**
 * [description]
 * @param  {Object} options.skipQuestions [description]
 * @return {Object} result        
 * @return {String} result.token     	  Refreshed OAuth token
 * @return {String} result.projectId      Project id
 */
const confirmCurrentProject = (options={ debug:false, selectProject: false }) => Promise.resolve(null).then(() => {
	if (options.debug === undefined) options.debug = false
	if (options.selectProject === undefined) options.selectProject = false

	if (options.skipQuestions) options.selectProject = options.skipQuestions

	//////////////////////////////
	// 1. Show current project
	//////////////////////////////
	return authConfig.get().then((config={}) => (config.google || {}))
		.then(config => {
			const { project: projectId, accessToken, refreshToken } = config
			// 1.1. If there is no OAuth config for Google yet, then prompt the user to consent.
			if (!accessToken || !refreshToken) {
				console.log(info('You don\'t have any Google OAuth saved yet. Requesting consent now...'))
				return getToken(Object.assign({}, options || {}, { refresh: true, origin: 'login' }))
					.then(() => projectHelper.updateCurrent(options))
			// 1.2. If there is no projectId, select one.
			} else if (!projectId) {
				return projectHelper.updateCurrent(options)
			} else // Otherwise, carry on
				return config
		})
		////////////////////////////////////////////
		// 2. Make sure the OAuth token is valid.
		////////////////////////////////////////////
		.then(({ project: projectId }) => getToken(options).then(token => ({ token, projectId })))
		////////////////////////////////////////////
		// 3. Make sure the App Engine exists.
		////////////////////////////////////////////
		.then(({ token, projectId }) => options.skipAppEngineCheck ? { token, projectId } : _confirmAppEngineIsReady(projectId, token, options))
})

/**
 * [description]
 * @param  {Object}   options.appConfig 		[description]
 * @param  {Boolean}  options.overrideAppConfig   [description]
 * @param  {String}   options.env             	[description]
 * @param  {Boolean}  options.debug             [description]
 * @param  {String}   options.projectPath       [description]
 * @return {[type]}                     		[description]
 */
const configure = (options={}) => Promise.resolve(null).then(() => {
	options.projectPath = projectHelper.getFullPath(options.projectPath)
	let configFileName = `app${options.env ? `.${options.env}`: ''}.json`
	let fileAlreadyExists = true

	//////////////////////////////
	// 1. Show current project and app engine details to help the user confirm that's the right one.
	//////////////////////////////
	return file.getAppJsonFiles(options.projectPath, options)
		.then(appDotJsons => {
			const forceChoice = options.forceAppConfigChoice && appDotJsons.length > 0
			const showChoicesInNormalSituations = !options.deploying && appDotJsons.length > 0 && !options.env
			if (forceChoice || showChoicesInNormalSituations) {
				const choices = appDotJsons.map((x, idx) => ({ name: ` ${idx+1}. ${bold(x)}`, value: x }))
				const chooseFile = appDotJsons.length == 1
					? Promise.resolve(appDotJsons[0])
					: promptList({ message: 'Which app.json file do you want to manage?', choices, separator: false})
				return chooseFile.then(answer => {
					if (!answer)
						process.exit()
					configFileName = answer
					options.env = configFileName == 'app.json' ? null : configFileName.match(/app\.(.*?)\.json/)[1]
					options.multipleConfig = appDotJsons.length > 1
				})
			}
		})
		.then(() => appHosting.get(options.projectPath, options))
		.then(hostingConfig => {
			const action = Object.keys(hostingConfig || {}).length == 0 // hosting does not exist
				? () => {
					fileAlreadyExists = false
					console.log(warn(`${bold(configFileName)} file not found.`))
					return askQuestion(question(`Do you want to create an ${bold(configFileName)} (Y/n)? `)).then(answer => {
						if (answer == 'n')
							process.exit()
						return confirmCurrentProject(options)
							.then(() => appHosting.get(options.projectPath, options))
					})
				}
				: () => Promise.resolve(hostingConfig || {})

			return action(hostingConfig)
		})
		//////////////////////////////
		// 2. Ask the user what they want to update
		//////////////////////////////
		.then(hostingConfig => {
			const indent = '   '
			const settings = _getDisplayableHostingConfig(hostingConfig, indent)
			const noSettings = !settings.trim()
			console.log(info(`Current ${bold(options.env ? `app.${options.env}.json` : 'app.json')} config: ${noSettings ? 'None yet' : ''}`))
			console.log(settings)
			return _updateRoot(obj.merge({}, hostingConfig), options)
		})
		.then(hostingConfig => {
			if (!hostingConfig)
				return null

			console.log(info(`Config:\n${_getDisplayableHostingConfig(hostingConfig, '   ')}`))
			return askQuestion(question('Are you sure you want to save those settings (Y/n) ?')).then(answer => {
				if (answer == 'n')
					return null
				else
					return appHosting.save(hostingConfig, options.projectPath, options).then(() => true)
			})
		})
		.then(result => {
			if (result)
				console.log(success(`${bold(configFileName)} successfully ${fileAlreadyExists ? 'updated' : 'created'}`))
		})
		.catch(e => {
			console.log(error(e.message, e.stack))
		})
}).catch(e => {
	console.log(error(e.message, e.stack))
})

const _chooseHandlerFile = (handlers, files=[]) => Promise.resolve(null).then(() => {
	handlers = !handlers || handlers.length == 0 ? [{ url: '.*' }] : handlers
	if (files.length == 1)
		return askQuestion(question(`Do you want to use ${bold(files[0])} to manage all your server's requests instead (Y/n) ?`)).then(answer => {
			if (answer == 'n')
				process.exit()
			return handlers.map(h => {
				h.url = h.url || '.*'
				h.script = h.script || files[0]
				return h
			})
		})
	else {
		const choices = files.map(f => ({ name: f, value: f }))
		return handlers.reduce((ask,h) => ask.then(acc => {
			if (h.script) {
				h.url = h.url || '.*'
				acc.push(h)
				return acc
			} else
				return promptList({ message: `Which script should handle the traffic from '${h.url || '.*'}'?`, choices, separator: false }).then(answer => {
					if (!answer)
						process.exit()

					h.url = h.url || '.*'
					h.script = h.script || answer
					acc.push(h)
					return acc
				})
		}), Promise.resolve([]))
	}
})

const _updateHostingConfig = (hostingConfig, projectId, handlers, options) => {
	hostingConfig.handlers = handlers 
	let props = { handlers }
	if (!hostingConfig.projectId) {
		hostingConfig.projectId = projectId
		props.projectId = projectId
	}
	if (!hostingConfig.service) {
		hostingConfig.service = 'default'
		props.service = 'default'
	}
	if (!hostingConfig.provider) {
		hostingConfig.provider = 'google'
		props.provider = 'google'
	}
	return appHosting.update(props, options.projectPath, options)
		.then(() => hostingConfig)
}

/**
 * Helps building an app.json if non exists so far
 * @param  {Object} hostingConfig [description]
 * @param  {Object} options       [description]
 * @return {[type]}               [description]
 */
const _initializeAppJson = (projectId, hostingConfig={}, options={}) => Promise.resolve(null).then(() => {
	if (options.projectPath) {
		return file.getFiles(options.projectPath, options)
			.then(allFiles => getHandlers(hostingConfig, allFiles))
			.then(handlers => _updateHostingConfig(hostingConfig, projectId, handlers, options))
			.catch(e => {
				if (e.code == 404) { // Files not found. Handler scripts are referencing missing files.
					console.log(error(e.message))
					console.log(JSON.stringify(e.handlers, null, '  '))
					process.exit()
				} else if (e.code == 501) { // Missing a server file. The server file is required to start the server and start listening to requests.
					const suggestedFiles = e.handlers && e.handlers.length > 0 ? (e.handlers[0].files || []) : []
					if (suggestedFiles.length == 0) {
						console.log(error(e.message))
						console.log(info('Add an \'app.js\' or a \'server.js\' or a \'index.js\' in the root dir of your project.'))
						console.log(info('Alternatively, you can also defined another js file, but you must then explicitely define a \'handlers\' property in the '))
						console.log(info('an \'app.json\' file (e.g., "handlers": [{ "url": ".*", script: "yourfile.js" }])'))
						process.exit()
					} else {
						console.log(warn('There is no \'app.js\', \'index.js\' or \'server.js\' in the root directory of your project.'))
						return _chooseHandlerFile(hostingConfig.handlers, suggestedFiles)
							.then(handlers => _updateHostingConfig(hostingConfig, projectId, handlers, options))
					}
				} else if (e.code == 502) { // Ambiguous files. Cannot decide which file should be used to start the server.
					console.log(warn(e.message))
					return _chooseHandlerFile(hostingConfig.handlers, e.handlers[0].files)
						.then(handlers => _updateHostingConfig(hostingConfig, projectId, handlers, options))
				} else if (e.code == 503) { // Missing required 'package.json'. A nodejs project must have one.
					console.log(error(e.message))
					process.exit()
				}
			})
	} else
		return hostingConfig
})

const _confirmAppEngineIsReady = (projectId, token, options={}) => (options.projectPath ? appHosting.get(options.projectPath, options) : Promise.resolve({}))
	.then(hostingConfig => _initializeAppJson(projectId, hostingConfig, options))
	.then((hostingConfig={}) => {
		const appProjectId = hostingConfig.projectId
		const appService = hostingConfig.service || 'default'

		if (appProjectId) {
			projectId = appProjectId
			options.selectProject = true
		}

		if (options.overrideHostingConfig) 
			options.selectProject = false

		////////////////////////////////////////////////
		// 1. Testing that the project is still active
		////////////////////////////////////////////////
		if (options.debug)
			console.log(debugInfo(`Testing Project ${bold(projectId)} still active.`))

		const projectStatusDone = wait('Checking Google Cloud Project status.')

		return gcp.project.get(projectId, token, options).then(res => {
			const { data } = res || {}
			projectStatusDone()
			return (!data || data.lifecycleState != 'ACTIVE'
				? (() => {
					options.selectProject = false
					console.log(warn(`Project ${bold(projectId)} not found. It is either inactive or you don't have access to it.`))
					const choices = [
						{ name: ' 1. Choose another project', value: 'project' },
						{ name: ' 2. Choose another account', value: 'account' }
					]
					return promptList({ message: 'Choose one of the following options:', choices, separator: false}).then(answer => {
						if (!answer)
							process.exit()
						return getToken(answer == 'account' ? { debug: options.debug, refresh: true, origin: 'Testing project active' } : { debug: options.debug, refresh: false, origin: 'Testing project active' })
							.then(tkn => projectHelper.updateCurrent(options).then(({ project: newProjectId }) => ({ projectId: newProjectId, token: tkn })))
					})
				})() 
				: Promise.resolve({ projectId, token}))
				.then(({ projectId, token }) => {
					if (options.debug)
						console.log(debugInfo(`Testing App Engine for Project ${bold(projectId)} exists.`))
					return { token, projectId }
				})
		})
		////////////////////////////////////////////
		// 2. Testing the App Engine exists
		////////////////////////////////////////////
			.then(({ token, projectId }) => {
				const appEngineStatusDone = wait('Checking App Engine status.')
				return gcp.app.get(projectId, token, options).then(res => {
					const { data } = res || {}
					appEngineStatusDone()
					const locationId = data && data.locationId ? data.locationId : null
					if (locationId) // 3.1. The App Engine exists, so move on.
						return gcp.app.getRegions().then(regions => ({ token, projectId, locationId: regions.find(({ id }) => id == locationId).label }))
					else // 3.2. The App Engine does not exist, so ask the user if one needs to be created now.
						return { token, projectId, locationId }
				})
			})
		////////////////////////////////////////////
		// 3. Prompt user to confirm
		////////////////////////////////////////////
			.then(({ token, projectId, locationId }) => { // 1.2. Prompt to confirm that the hosting destination is correct.
				return _promptUserToConfirm(projectId, appService, locationId, token, hostingConfig, options)
			})
				
	})

const _promptUserToConfirm = (projectId, serviceId, locationId, token, hostingConfig, options={}) => Promise.resolve(null).then(() => {
	const choices = [
		{ name: ' Yes', value: 'yes' },
		{ name: ' Yes, but choose another service', value: 'switchService' },
		{ name: ' Yes, but choose another project', value: 'switchProject' },
		{ name: ' Yes, but choose another account', value: 'switchAccount' },
		{ name: ' Yes, but configure advanced options first (ex: scaling, machine type, ...)', value: 'advanced' }
	]

	const skipMakingChoices = options.selectProject && locationId
	let ask

	if (options.changeAccount)
		ask = askQuestion(question('Do you want to use another Google Account (Y/n) ? '))
			.then(yes => yes == 'n' ? null : 'switchAccount')
	else if (!skipMakingChoices) {
		const _showCurrentSettings = (projectId, locationId, serviceId, hostingConfig, choices) => {
			console.log(info('Main settings:'))
			console.log(`   Project: ${bold(projectId)} (${locationId})`)
			console.log(`   Service: ${bold(serviceId)}`)
			console.log(`   App Engine's Environment: ${bold(!hostingConfig.env || hostingConfig.env == 'standard' ? 'standard' : 'flexible')}`)
			return promptList({ message: 'Do you want to continue?', choices, separator: false})
		}
		ask = (() => {
			if (locationId) 
				return _showCurrentSettings(projectId, locationId, serviceId, hostingConfig, choices)
			else
				return _dealWithNoAppEngine(projectId, token, options)
					.then(({ locationId: lId }) => locationId = lId)
					.then(() => _showCurrentSettings(projectId, locationId, serviceId, hostingConfig, choices))
		})()
	} else
		ask = Promise.resolve('yes')

	return ask.then(answer => {
		if (!answer)
			process.exit()
		else if (answer == 'switchService') {
			return chooseService(projectId, obj.merge(options, { noExit: true }))
				.then(service => appHosting.update({ service }, options.projectPath, options))
				.then(() => _confirmAppEngineIsReady(projectId, token, obj.merge(options, { hostingConfig: null, overrideHostingConfig: true })))
		} else if (answer == 'switchProject') 
			return chooseProject(options)
				.then(({ token, projectId }) => appHosting.update({ projectId }, options.projectPath, options).then(() => ({ token, projectId })))
				.then(({ token, projectId }) => _confirmAppEngineIsReady(projectId, token, obj.merge(options, { hostingConfig: null, overrideHostingConfig: true })))
		else if (answer == 'switchAccount') 
			return chooseAccount(options)
				.then(({ token, projectId }) => appHosting.update({ projectId }, options.projectPath, options).then(() => ({ token, projectId })))
				.then(({ token, projectId }) => _confirmAppEngineIsReady(projectId, token, obj.merge(options, { hostingConfig: null, overrideHostingConfig: true })))
		else if (answer == 'advanced')
			return configure(obj.merge(options, { accountSettings: false }))
				.then(() => _confirmAppEngineIsReady(projectId, token, obj.merge(options, { hostingConfig: null, overrideHostingConfig: true })))
		else {
			return !locationId 
				? _dealWithNoAppEngine(projectId, token, options).then(({ token, projectId, locationId }) => ({ token, projectId, locationId, service: serviceId }))
				: { token, projectId, locationId, service: serviceId }
		}
	})
})

const _dealWithNoAppEngine = (projectId, token, options) => gcp.app.getRegions().then(regions => {
	const q1 = info(`No App Engine in current project ${bold(projectId)}`)
	const q2 = question('Do you want to create one now (Y/n)? ')
	
	const mode = m => m == 'noQuestion'
		? Promise.resolve(null).then(() => {
			console.log(q1)
			console.log(info('Let\'s create one quickly so we can continue'))
		})
		: askQuestion(`${q1}\n${q2}`)
	
	return mode('noQuestion').then(answer => {
		if (answer == 'n')
			return { token, projectId, locationId: null }
		// 3.2.1. Choose region
		const choices = regions.map(({ id, label }, idx) => ({
			name: ` ${idx+1}. ${label}`,
			value: id,
			short: id				
		}))

		// 3.2.2. Create App Engine
		return promptList({ message: 'Select a region (WARNING: This cannot be undone!):', choices, separator: false})
			.catch(e => {
				console.log(error(e.message))
				console.log(error(e.stack))
				process.exit()
			}).then(answer => {
				if (!answer) 
					return { token, projectId, locationId: null }

				const appEngDone = wait(`Creating a new App Engine (region: ${bold(answer)}) in project ${bold(projectId)}`)
				return gcp.app.create(projectId, answer, token, options)
					.then(({ data: { operationId } }) => promise.check(
						() => gcp.app.getOperationStatus(projectId, operationId, token, options).catch(e => {
							console.log(error(`Unable to verify deployment status. Manually check the status of your build here: ${link(`https://console.cloud.google.com/cloud-build/builds?project=${projectId}`)}`))
							throw e
						}), 
						({ data }) => {
							if (data && data.done) {
								appEngDone()
								return true
							}
							else if (data && data.message) {
								console.log(error('Fail to create App Engine. Details:', JSON.stringify(data, null, '  ')))
								process.exit()
							} else 
								return false
						})
					)
					.catch(e => {
						console.log(error('Fail to create App Engine.', e.message, e.stack))
						throw e
					})
					.then(() => {
						console.log(success(`App Engine (region: ${bold(answer)}) successfully created in project ${bold(projectId)}.`))
						return { token, projectId, locationId: regions.find(({ id }) => id == answer).label }
					})
			})
	})
})

const chooseAccount = (options={}) => getToken({ debug: options.debug, refresh: true, origin: 'Prompt to confirm' })
	.then(tkn => projectHelper.updateCurrent(obj.merge(options, { silentMode: true })).then(({ project: newProjectId }) => ({ projectId:newProjectId, token: tkn })))

const chooseProject = (options={}) => getToken({ debug: options.debug, refresh: false, origin: 'Prompt to confirm' })
	.then(tkn => projectHelper.updateCurrent(obj.merge(options, { silentMode: true })).then(({ project: newProjectId }) => ({ projectId:newProjectId, token: tkn })))

const chooseService = (projectId, options={}) => getToken(options).then(token => {
	let loadingSvcDone = wait('Loading services')
	const opts = obj.merge(options, { verbose: false })
	return gcp.app.service.list(projectId, token, opts).then(res => ({ loadingSvcDone, data: res.data }))
		.catch(e => { 
			loadingSvcDone()
			try {
				const er = JSON.parse(e.message)
				if (er.code == 404 && (er.message || '').toLowerCase().indexOf('could not find application') >= 0)  {
					console.log(info(`There are no services in project ${bold(projectId)} because you haven't created an App Engine yet.`))
					return _dealWithNoAppEngine(projectId, token, options).then(({ locationId }) => {
						if (!locationId) {
							if (options.noExit)
								return { loadingSvcDone, error: 'noLocationId' }
							else
								process.exit()
						}
						loadingSvcDone = wait('Loading services')
						return gcp.app.service.list(projectId, token, opts).then(res => ({ loadingSvcDone, data: res.data }))
					})
				}
			} catch(_e) { (() => null)(_e) }
			throw e 
		})
}).then(({ loadingSvcDone, data, error }) => {
	loadingSvcDone()
	if (error)
		return 'default'
	const currentService = options.serviceName || 'default'
	if (!data || data.length == 0) {
		if (options.defaultOn)
			console.log(info('Choosing a service is not yet possible. No services have been created yet.'))
		console.log(info('The \'default\' service is required to be created first. Once it is created, creating other services will be allowed.'))
		return options.defaultOn ? 'default' : askQuestion(question('Do you want to continue using the \'default\' service (Y/n)? ')).then(answer => {
			if (answer == 'n')
				options.noExit ? 'default' : process.exit()
			else
				return 'default'
		})
	} else {
		const choices = [
			...collection.sortBy(data.map(d => {
				const isCurrent = d.id == currentService
				const n = isCurrent ? `${bold('[ Current ]')} ${d.id}` : `${d.id}`
				return { name: n, value: `${d.id}`, idx: isCurrent ? 0 : 1 }
			}), x => x.idx, 'asc'),
			{ name: 'Create new service', value: 'create new', specialOps: true }]

		const formattedChoices = choices.map((x, idx) => ({
			name: x.value == 'create new' ? x.name : ` ${idx+1}. ${x.name}`,
			value: x.value,
			specialOps: x.specialOps
		}))

		return promptList({ message: options.optionsMessage || 'Choose one of the following options:', choices: formattedChoices, separator: false}).then(answer => {
			if (answer == 'create new')
				return _chooseServiceName()
			else
				return answer
		})
	}
})

const _chooseServiceName = () => askQuestion(question('Enter service name: ')).then(answer => {
	if (!answer || answer.length < 3 || !answer.match(/^[a-z0-9\-_]+$/)) {
		console.log(info('A service name must be at least 3 characters long and it can only contain lowercase alphanumerics, \'-\' and \'_\'.'))
		return _chooseServiceName()
	} else 
		return answer
})

const checkOperation = (projectId, operationId, token, onSuccess, onFailure, options) => promise.check(
	() => gcp.app.getOperationStatus(projectId, operationId, token, options).catch(e => {
		console.log(error(`Unable to check operation status. To manually check that status, go to ${link(`https://console.cloud.google.com/cloud-build/builds?project=${projectId}`)}`))
		throw e
	}), 
	({ data }) => {
		if (data && data.done) {
			if (onSuccess) onSuccess(data)
			return { message: 'done' }
		}
		else if (data && data.message) {
			if (onFailure) onFailure(data)
			return { error: data }
		} else 
			return false
	}, options)

const checkBuildOperation = (projectId, operationId, token, onSuccess, onFailure, options) => promise.check(
	buildId => buildId 
		? gcp.build.get(projectId, buildId, token, options).catch(e => {
			console.log(error(`Unable to check build status. To manually check that status, go to ${link(`https://console.cloud.google.com/cloud-build/builds/${buildId}?project=${projectId}`)}`))
			throw e
		}).then(({ status, data }) => {
			data.metadata = data.metadata || {}
			data.metadata.createVersionMetadata = data.metadata.createVersionMetadata || {}
			data.metadata.createVersionMetadata.cloudBuildId = buildId
			return { status, data }
		})
		: gcp.app.getOperationStatus(projectId, operationId, token, options).catch(e => {
			console.log(error(`Unable to check operation status. To manually check that status, go to ${link(`https://console.cloud.google.com/cloud-build/builds?project=${projectId}`)}`))
			throw e
		}), 
	({ data }) => {
		if (data && (data.done || data.status == 'SUCCESS')) {
			if (onSuccess) onSuccess(data)
			return { message: 'done' }
		}
		else if (data && data.message || data.status == 'FAILURE') {
			if (onFailure) onFailure(data)
			return { error: data }
		} else if (data && data.metadata && data.metadata.createVersionMetadata && data.metadata.createVersionMetadata.cloudBuildId)
			return { nextState: data.metadata.createVersionMetadata.cloudBuildId }
		else
			return false
	}, options)

const _updateRoot = (answers={}, options={}) => Promise.resolve(null).then(() => {
	const accountSettings = options.accountSettings === undefined ? true : options.accountSettings

	const choices = []
	if (accountSettings)
		choices.push(...[
			{ name: 'Google Account', value: 'account' },
			{ name: 'Project', value: 'project' },
			{ name: 'Service', value: 'service' }])

	choices.push(...[
		{ name: 'Environment (standard vs flexible)', value: 'env' },
		{ name: 'Instances', value: 'instances' },
		{ name: 'Scaling', value: 'scales' },
		{ name: 'Handlers', value: 'handlers' }
	])

	if (accountSettings) {
		choices.push({ name: 'Duplicate this config', value: 'duplicate' })
		if (options.multipleConfig)
			choices.push({ name: 'Switch to another app.<env>.json', value: 'switch' })
	}

	choices.push(...[
		{ name: 'Show current config', value: 'show' },
		{ name: 'Save', value: 'save', specialOps: true }])

	const formattedChoices = choices.map((x, idx) => ({
		name: x.value == 'save' ? x.name : ` ${idx+1}. ${x.name}`,
		value: x.value,
		specialOps: x.specialOps
	}))

	const fileName = options.env ? `app.${options.env}.json` : 'app.json'

	return promptList({ message: options.message || `Configure the ${fileName}:`, choices: formattedChoices, separator: false}).then(answer => {
		if (!answer) 
			return null
		else if (answer == 'account')
			return chooseAccount({ noExit: true }).then(({ projectId }) => {
				if (projectId)
					answers.projectId = projectId
				return _updateRoot(answers, options)
			})
		else if (answer == 'project')
			return chooseProject({ noExit: true, currentProjectId: answers.projectId }).then(({ projectId }) => {
				if (projectId)
					answers.projectId = projectId
				return _updateRoot(answers, options)
			})
		else if (answer == 'service') {
			if (answers.projectId)
				return chooseService(answers.projectId, { defaultOn: true, serviceName: answers.service, optionsMessage: `Services avalaible in project ${answers.projectId}` }).then(service => {
					answers.service = service || answers.service || 'default'
					return _updateRoot(answers, options)
				})
			else {
				console.log(info('To choose a service, a project must be selected first'))
				return askQuestion(question('Do you want to choose a project (Y/n) ? ')).then(yes => {
					if (yes == 'n')
						return _updateRoot(answers, options)
					else
						return chooseProject({ noExit: true, currentProjectId: answers.projectId }).then(({ projectId }) => {
							if (projectId)
								answers.projectId = projectId
							return _updateRoot(answers, options)
						})
				})
			}
		}
		else if (answer == 'env')
			return _chooseEnv(answers, options)
		else if (answer == 'instances')
			return _chooseInstances(answers, options)
		else if (answer == 'scales')
			return _chooseScalingType(answers, options)
		else if (answer == 'handlers')
			return _configureHandlers(answers, options)
		else if (answer == 'show') {
			const indent = '   '
			const msg = _getDisplayableHostingConfig(answers, indent)
			console.log(msg.trim() ? msg : `${indent}No config yet`)
			return _updateRoot(answers, options)
		} else if (answer == 'duplicate') {
			return askQuestion(question('Enter an environment name (leave it blank if you want to override the app.json): ')).then(n => {
				const envName = ((n || '').toLowerCase().match(/[a-z]/g) || []).join('')
				const fileName = `app${envName ? `.${envName}` : ''}.json`
				return file.exists(path.join(options.projectPath, fileName))
					.catch(() => null)
					.then(yes => yes
						? askQuestion(question(`An ${bold(fileName)} already exists. Do you want to override its ${bold('hosting')} property (Y/n) ?`))
						: null)
					.then(yes => {
						if (yes == 'n')
							return _updateRoot(answers, options)
						else
							return appJsonHelper.get(options.projectPath, { env: envName })
								.then(appJsonConfig => {
									appJsonConfig = appJsonConfig || {}
									appJsonConfig.hosting = answers
									return appJsonHelper.save(appJsonConfig, options.projectPath, { env: envName })
										.then(() => {
											console.log(success(`${bold(fileName)} successfully saved`))
											options.multipleConfig = true
											return _updateRoot(answers, options)
										})
								})
					})
			})
		}
		else if (answer == 'switch')
			return configure(obj.merge(options, { forceAppConfigChoice: true }))
		else if (answer == 'save')
			return answers
	})
})

const _enterARegex = () => askQuestion(question(`Enter a regex (default ${bold('.*')}): `)).then(answer => {
	answer = answer || '.*'
	try {
		new RegExp(answer)
		return answer
	} catch(e) {
		return Promise.resolve(e).then(() => {
			console.log(error(`${bold(answer)} is not a valid regex`))
			return askQuestion(question('Do you want try again (Y/n) ?')).then(yes => {
				if (yes == 'n')
					return null
				return _enterARegex()
			})
		})	
	}
})

const _createNewHandler = (answers={}, handlers=[], scriptChoices=[], options={}) => _enterARegex().then(regExAnswer => {
	const action = regExAnswer
		? promptList({ message: 'Choose a script to handle traffic:', choices: scriptChoices, separator: false }).then(scriptAnswer => {
			if (scriptAnswer) {
				handlers.push({ urlRegex: regExAnswer, script: { scriptPath: scriptAnswer } })
				answers.handlers = handlers
				console.log(success('New handler successfully created'))
			} 
		})
		: Promise.resolve(null)

	return action.then(() => _configureHandlers(answers, options))
})

const _configureHandlers = (answers={}, options={}) => file.getFiles(options.projectPath, { pattern: '**/*.js', ignore: '**/node_modules/**' })
	.then(scripts => {
		scripts = scripts.map(s => s.replace(options.projectPath, ''))
		const scriptChoices = scripts.map(s => {
			const fileName = s.replace(options.projectPath, '')
			return { name: fileName, value: fileName }
		})
		
		const handlers = answers.handlers || []
		const backUpHandlers = options.backUpHandlers || handlers.map(h => obj.merge({}, h))

		const returnToRoot = (answers, options) => _updateRoot(answers, obj.merge(options, { backUpHandlers: null, message: ALT_QUESTION(options.env) }))
		
		if (handlers.length == 0) {
			console.log(info('There is no handler configured yet'))
			return askQuestion(question('Do you want to create a new handler (Y/n) ?')).then(yes => {
				if (yes == 'n')
					return returnToRoot(answers, options)
				console.log(info('First you need to define a regex which filters the traffic that can be processed by'))
				console.log(info('your new handler\'s script. For example, if your app processes all its traffic the same'))
				console.log(info(`way, then you only need to define a single handler with this regex: ${bold('.*')}`))
				return _createNewHandler(answers, handlers, scriptChoices, obj.merge(options, { backUpHandlers }))
			})
		} else {
			const choices = [
				...handlers.map((h, idx) => ({ name: ` ${idx+1}. ${bold(h.urlRegex)} --> ${bold((h.script || {}).scriptPath)}` , value: idx })), 
				{ name: 'Create', value: 'create', specialOps: true },
				{ name: 'Save', value: 'save', specialOps: true }]

			return promptList({ message: 'Edit a handler:', choices, separator: false }).then(answer => {
				if (!answer && answer != 0) {
					if (backUpHandlers.length == 0)
						delete answers.handlers
					else
						answers.handlers = backUpHandlers
					return returnToRoot(answers, options)
				}
				else if (answer == 'save')
					return returnToRoot(answers, options)
				else if (answer == 'create')
					return _createNewHandler(answers, handlers, scriptChoices, obj.merge(options, { backUpHandlers }))
				else {
					return promptList({ message: 'Options:', choices: [{ name: 'Update this Handler', value: 'u' }, { name: 'Delete this Handler', value: 'd' }], separator: false })
						.then(next => {
							const action = next == 'd' ? Promise.resolve(null).then(() => {
								delete handlers[answer]
								answers.handlers = handlers.filter(x => x)
								console.log(success('Handler successfully deleted'))							
							}) : Promise.resolve(null).then(() => {
								const h = handlers[answer]
								return promptList({ message: 'Choose a script to handle traffic:', choices: scriptChoices, separator: false }).then(scriptAnswer => {
									if (scriptAnswer) {
										h.script = { scriptPath: scriptAnswer }
										answers.handlers = handlers
										console.log(success('New handler successfully updated'))
									}
								})
							})

							return action.then(() => _configureHandlers(answers, obj.merge(options, { backUpHandlers })))
						})
				}
			})
		}
	})

const _chooseEnv = (answers={}, options={}) => Promise.resolve(null).then(() => {
	const choices = [
		{ name: ' 1. Standard', value: 'standard' },
		{ name: ' 2. Flexible', value: 'flex' }
	]

	return promptList({ message: 'Available options:', choices, separator: false}).then(answer => {
		const action = !answer || answers.env == answer
			? Promise.resolve(null)
			: Promise.resolve(null).then(() => {
				console.log(warn(`Updating your environment from ${bold(answers.env || 'standard')} to ${bold(answer)} will reset the settings to default:`))
				return askQuestion(question('Do you want to continue (Y/n) ? ')).then(yes => {
					if (yes != 'n') {
						answers.env = answer
						appHosting.reset(answers)
					}
				})
			})
			
		return action.then(() => _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) })))
	})
})

const _chooseInstances = (answers={}, options={}) => Promise.resolve(null).then(() => {
	const env = answers.env || 'standard'
	const autoScalingOn = answers.automaticScaling || (!answers.automaticScaling && !answers.basicScaling && !answers.manualScaling)

	return gcp.app.getInstanceTypes().then(instances => {
		const envInstances = instances.filter(x => {
			if (env == 'standard') {
				if (autoScalingOn)
					return x.env == 'standard' && x.scalingType == 'auto'
				else
					return x.env == 'standard' && x.scalingType != 'auto'
			} else
				return x.env == env
		})
		const choices = envInstances.map((i, idx) => ({ name: ` ${idx+1}. ${i.label}`, value: i.id }))

		return promptList({ message: `Available options for ${env.toUpperCase()} environments:`, choices, separator: false}).then(answer => {
			if (!answer)
				return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))

			const instanceClass = answer
			if (env == 'flex') {
				const inst = envInstances.find(x => x.id == answer)
				const types = inst.specs.map(({ cores, mem }, idx) => ({ name: ` ${idx+1}. Core: ${cores} - Memory: ${mem} GB`, value: idx }))
				return promptList({ message: 'Choose a spec:', choices: types, separator: false}).then(answer => {
					if (!answer && answer != 0)
						return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
					else{
						const specs = inst.specs[answer]
						const resources = {
							cpu: specs.cores,
							memoryGb: specs.mem
						}
						delete answers.instanceClass
						answers.resources = obj.merge(answers.resources || {}, resources)
						return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
					}
				}) 
			} else {
				answers.instanceClass = instanceClass
				if (answers.resources) {
					delete answers.resources.cpu
					delete answers.resources.diskGb
					delete answers.resources.memoryGb
					delete answers.resources.volumes
				}
				return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
			}
		})
	})
})

const _chooseScalingType = (answers={}, options={}) => Promise.resolve(null).then(() => {
	const choices = [
		{ name: ' 1. Automatic', value: 'auto' },
		{ name: ' 2. Basic', value: 'basic' },
		{ name: ' 3. Manual', value: 'manual' }
	]
	return promptList({ message: 'Available options:', choices, separator: false}).then(answer => {
		if (!answer)
			return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))

		if (answer == 'auto') {
			return _configureAutoScaling(answers, 'Which auto-scaling options do you want to configure?', null, options)
		} else if (answer == 'basic') {
			delete answers.automaticScaling
			delete answers.manualScaling
			return _configureBasicScaling(answers, 'Which basic-scaling options do you want to configure?', null, options)
		} else {
			delete answers.automaticScaling
			delete answers.basicScaling
			return _configureManualScaling(answers, null, options)
		}
	})
})

const _configureAutoScalingCoolDownPeriod = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('How long should the autoscaler wait (unit: second) before changing the number of instances (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingCoolDownPeriod(answers)
		} else if (answer)
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, { coolDownPeriod: `${answer}s` })

		return answers
	})
})

const _configureAutoScalingMaxConcurrentRequests = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('How many concurrent requests can be accepted before the scheduler spawns a new instance (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMaxConcurrentRequests(answers)
		} else if (answer)
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, { maxConcurrentRequests: answer*1 })

		return answers
	})
})

const _configureAutoScalingMinIdleInstances = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the minimum number of idle instances that should be maintained (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMinIdleInstances(answers)
		} else if (answer)
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, { minIdleInstances: answer*1 })

		return answers
	})
})

const _configureAutoScalingMaxIdleInstances = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the maximum number of idle instances that should be maintained (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMaxIdleInstances(answers)
		} else if (answer)
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, { maxIdleInstances: answer*1 })

		return answers
	})
})

const _configureAutoScalingMinTotalInstances = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the minimum number of running instances that should be maintained (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMinTotalInstances(answers)
		} else if (answer) {
			const c = !answers.env || answers.env == 'standard' 
				? { standardSchedulerSettings: { minInstances: answer*1 } }
				: { minTotalInstances: answer*1 }
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, c)
		}

		return answers
	})
})

const _configureAutoScalingMaxTotalInstances = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the maximum number of instances that could be started (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMaxTotalInstances(answers)
		} else if (answer) {
			const c = !answers.env || answers.env == 'standard' 
				? { standardSchedulerSettings: { maxInstances: answer*1 } }
				: { maxTotalInstances: answer*1 }
			answers.automaticScaling = obj.merge(answers.automaticScaling || {},  c )
		}

		return answers
	})
})

const _configureAutoScalingTargetCpuUtilization = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('Enter a number between 0 and 100 that represents the percentate of CPU utilization that should trigger the creation of a new instance (default: 60) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingTargetCpuUtilization(answers)
		} else if (answer) {
			let nbr = answer*1
			nbr = (nbr > 95 ? 95 : nbr < 5 ? 5 : nbr) / 100
			const c = !answers.env || answers.env == 'standard' 
				? { standardSchedulerSettings: { targetCpuUtilization: nbr } }
				: { cpuUtilization: { targetUtilization: nbr } }
			answers.automaticScaling = obj.merge(answers.automaticScaling || {},  c )
		}

		return answers
	})
})

const _configureAutoScalingTargetThroughputUtilization = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('Enter a number between 0 and 100 that represents the percentate of the maximum concurrent requests that should trigger the creation of a new instance (default: 60) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingTargetThroughputUtilization(answers)
		} else if (answer) {
			let nbr = answer*1
			nbr = (nbr > 95 ? 95 : nbr < 5 ? 5 : nbr) / 100
			const maxFlexInstances = answers.maxTotalInstances || 20
			let targetConcurrentRequests = Math.round(nbr * maxFlexInstances)
			targetConcurrentRequests = targetConcurrentRequests < 1 ? 1 : targetConcurrentRequests
			const c = !answers.env || answers.env == 'standard' 
				? { standardSchedulerSettings: { targetThroughputUtilization: nbr } }
				: { requestUtilization: { targetConcurrentRequests } }
			answers.automaticScaling = obj.merge(answers.automaticScaling || {},  c )
		}

		return answers
	})
})

const _configureAutoScalingMinPendingLatency = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the minimum amount of time a request should wait in the pending queue before starting a new instance to handle it (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMinPendingLatency(answers)
		} else if (answer)
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, { minPendingLatency: `${answer}s` })

		return answers
	})
})

const _configureAutoScalingMaxPendingLatency = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the maximum amount of time (unit: second) that a request should wait in the pending queue before starting a new instance to handle it (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureAutoScalingMaxPendingLatency(answers)
		} else if (answer)
			answers.automaticScaling = obj.merge(answers.automaticScaling || {}, { maxPendingLatency: `${answer}s` })

		return answers
	})
})

const _configureBasicScalingMaxInstances = (answers={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('What\'s the maximum number of instances that can be provisioned (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureBasicScalingMaxInstances(answers)
		} else if (answer)
			answers.basicScaling = obj.merge(answers.basicScaling || {}, { maxInstances: answer*1 })

		return answers
	})
})

const _configureBasicScalingIdleTimeOut = (answers={}, options={}) => Promise.resolve(null).then(() => {
	return askQuestion(question('How much idle time (unit: second) decommission an instance (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureBasicScalingIdleTimeOut(answers)
		} else if (answer)
			answers.basicScaling = obj.merge(answers.basicScaling || {}, { idleTimeout: `${answer}s` })

		return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
	})
})

// Doc: 
// 	- Standard env: https://cloud.google.com/appengine/docs/standard/python/config/appref#scaling_elements
// 	- Flexible env: https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services.versions#AutomaticScaling
const AUTOSCALING_OPTIONS = [
	{ name: 'Min instances', value: '_configureAutoScalingMinTotalInstances', env: 'both' },
	{ name: 'Max instances', value: '_configureAutoScalingMaxTotalInstances', env: 'both' },
	{ name: 'Max concurrent requests', value: '_configureAutoScalingMaxConcurrentRequests', env: 'both' },
	{ name: 'CPU utilization trigger', value: '_configureAutoScalingTargetCpuUtilization', env: 'both' },
	{ name: 'Concurrent requests trigger', value: '_configureAutoScalingTargetThroughputUtilization', env: 'both' },
	{ name: 'Min idle instances', value: '_configureAutoScalingMinIdleInstances', env: 'both' },
	{ name: 'Max idle instances', value: '_configureAutoScalingMaxIdleInstances', env: 'both' },
	{ name: 'Min pending latency', value: '_configureAutoScalingMinPendingLatency', env: 'both' },
	{ name: 'Max pending latency', value: '_configureAutoScalingMaxPendingLatency', env: 'both' },
	{ name: 'Cool down period', value: '_configureAutoScalingCoolDownPeriod', env: 'flex' }
]
const _configureAutoScaling = (answers={}, message, backup, options={}) => Promise.resolve(null).then(() => {
	if (!backup)
		backup = obj.merge(answers)

	const env = answers.env || 'standard'

	const choices = [
		...AUTOSCALING_OPTIONS.filter(x => x.env == 'both' || env.indexOf(x.env) >= 0 ), 
		{ name: 'Save', value: 'save', specialOps: true }]

	const formattedChoices = choices.map((x, idx) => ({
		name: x.value == 'save' ? x.name : ` ${idx+1}. ${x.name}`,
		value: x.value,
		specialOps: x.specialOps
	}))

	return promptList({ message: message || 'What other auto-scaling options do you want to configure?', choices: formattedChoices, separator: false}).then(answer => {
		if (answer && answer != 'save') 
			return Promise.resolve(eval(`${answer}(answers, options)`)).then(() => _configureAutoScaling(answers, message, backup, options))
		else if (!answer) { // Abort, which means restore
			answers.automaticScaling = backup.automaticScaling
			return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
		} else { // Save
			const standardEnv = !answers.env || answers.env == 'standard'
			const standardBasicInstanceClass = standardEnv && answers.instanceClass && answers.instanceClass.toLowerCase().match(/^b/)
			const applyChanges = () => {
				delete answers.basicScaling
				delete answers.manualScaling
			}
			const action = standardBasicInstanceClass 
				? Promise.resolve(console.log(warn(`Saving those changes will reset your instance class from ${bold(answers.instanceClass)} to its default for auto-scaling (F1)`))).then(() => 
					askQuestion(question('Are you sure you want to save (Y/n) ? ')).then(yes => {
						if (yes == 'n') // reset
							answers.automaticScaling = backup.automaticScaling
						else {
							applyChanges()
							delete answers.instanceClass
						}
					}))
				: Promise.resolve(applyChanges())

			return action.then(() => _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) })))
		}
	})
})

// Doc: 
// 	- Standard env: https://cloud.google.com/appengine/docs/standard/python/config/appref#basic_scaling
// 	- Flexible env: https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services.versions#BasicScaling
const _configureBasicScaling = (answers={}, message, backup, options={}) => Promise.resolve(null).then(() => {
	if (!backup)
		backup = obj.merge(answers)

	const choices = [
		{ name: ' 1. Max. number of instances', value: '_configureBasicScalingMaxInstances' },
		{ name: ' 2. Idle timeout', value: '_configureBasicScalingIdleTimeOut' },
		{ name: 'Save', value: 'save', specialOps: true }
	]

	return promptList({ message: message || 'What other basic-scaling options do you want to configure?', choices, separator: false}).then(answer => {
		if (answer && answer != 'save') 
			return Promise.resolve(eval(`${answer}(answers, options)`)).then(() => _configureBasicScaling(answers, message, backup, options))
		else if (!answer) { // Abort, which means restore
			answers.basicScaling = backup.basicScaling
			return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
		} else { // Save
			const standardEnv = !answers.env || answers.env == 'standard'
			const standardAutoInstanceClass = standardEnv && answers.instanceClass && answers.instanceClass.toLowerCase().match(/^f/)
			const applyChanges = () => {
				delete answers.automaticScaling
				delete answers.manualScaling
			}
			const action = standardAutoInstanceClass 
				? Promise.resolve(console.log(warn(`Saving those changes will reset your instance class from ${bold(answers.instanceClass)} to its default for basic-scaling (B2)`))).then(() => 
					askQuestion(question('Are you sure you want to save (Y/n) ? ')).then(yes => {
						if (yes == 'n') // reset
							answers.basicScaling = backup.basicScaling
						else {
							applyChanges()
							delete answers.instanceClass
						}
					}))
				: Promise.resolve(applyChanges())

			return action.then(() => _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) })))
		}
	})
})

// Doc: 
// 	- Standard env: https://cloud.google.com/appengine/docs/standard/python/config/appref#manual_scaling
// 	- Flexible env: https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services.versions#ManualScaling
const _configureManualScaling = (answers={}, backup, options={}) => Promise.resolve(null).then(() => {
	if (!backup)
		backup = obj.merge(answers)

	return askQuestion(question('How many instances do you want to provision (Enter a number) ? ')).then(answer => {
		if (answer && typeof(answer*1) != 'number') {
			console.log(info('You can only specify a number. Try again.'))
			return _configureManualScaling(answers, backup)
		} else if (!answer) { // Abort, which means restore
			answers.manualScaling = backup.manualScaling
			return _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) }))
		} else { // Save
			const standardEnv = !answers.env || answers.env == 'standard'
			const standardAutoInstanceClass = standardEnv && answers.instanceClass && answers.instanceClass.toLowerCase().match(/^f/)
			const applyChanges = () => {
				answers.manualScaling = { instances: answer*1 }
				delete answers.automaticScaling
				delete answers.basicScaling
			}
			const action = standardAutoInstanceClass 
				? Promise.resolve(console.log(warn(`Saving those changes will reset your instance class from ${bold(answers.instanceClass)} to its default for manual-scaling (B2)`))).then(() => 
					askQuestion(question('Are you sure you want to save (Y/n) ? ')).then(yes => {
						if (yes == 'n') // reset
							answers.manualScaling = backup.manualScaling
						else {
							applyChanges()
							delete answers.instanceClass
						}
					}))
				: Promise.resolve(applyChanges())

			return action.then(() => _updateRoot(answers, obj.merge(options, { message: ALT_QUESTION(options.env) })))
		}
	})
})

const _isEmptyObj = obj => {
	if (!obj)
		return true 
	try {
		const o = JSON.stringify(obj)
		return o == '{}'
	} catch(e) {
		return (() => false)(e)
	}
}

const _isObj = obj => {
	if (!obj || typeof(obj) != 'object')
		return false 

	try {
		const o = JSON.stringify(obj) || ''
		return o.match(/^\{(.*?)\}$/)
	} catch(e) {
		return (() => false)(e)
	}
}

const _removeEmptyObjectProperties = obj => {
	if (!_isObj(obj))
		return obj 
	
	return Object.keys(obj).reduce((acc, key) => {
		const val = obj[key]
		if (_isObj(val)) {
			if (!_isEmptyObj(val))
				acc[key] = _removeEmptyObjectProperties(val)
		} else
			acc[key] = val 
		return acc
	}, {})
}

const _getDisplayableHostingConfig = (hostingConfig, indent='') => {
	if (!hostingConfig)
		return ''

	let h = obj.merge(hostingConfig) || {}
	h.env = h.env || 'standard'
	if (h.env == 'standard') {
		h.automaticScaling = h.automaticScaling || (!h.basicScaling && !h.manualScaling ? 'automatic' : h.automaticScaling)
		h.instanceClass = h.instanceClass || (h.automaticScaling ? 'F1' : 'B2' )
	} 

	const sortedProps = ['provider', 'projectId', 'service', 'env', 'instanceClass', 'resources', 'automaticScaling', 'basicScaling', 'manualScaling']
	const otherProps = Object.keys(h).filter(propName => !sortedProps.some(x => x == propName))
	const sortedHosting = [...sortedProps, ...otherProps].reduce((acc, key) => {
		const v = h[key]
		if (v)
			acc[key] = v
		return acc
	}, {})

	const output = ['', ...JSON.stringify(_removeEmptyObjectProperties(sortedHosting), null, '  ')
		.replace(/(\{|\}|"|,|\[|\])/g, '') // Remove { } [ ] , " 
		.split('\n') // 
		.filter(x => x.trim())
		.map(x => {
			const [label, ...values] = x.split(':')
			return `${label}: ${bold(values.join(':').trim())}`
		})]
		.join(`\n${indent}`)

	return `${output}\n`
}



module.exports = {
	project: {
		confirm: confirmCurrentProject,
		choose: chooseProject
	},
	operation: {
		check: checkOperation,
		checkBuild: checkBuildOperation
	},
	service: {
		choose: chooseService
	},
	account: {
		choose: chooseAccount
	},
	configure
}




