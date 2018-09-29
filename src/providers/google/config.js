/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const path = require('path')
const { file, obj, yaml }  = require('../../utils')
const { error, bold }  = require('../../utils/console')

/**
 * Make sure the properties of the hosting config are consistent with the environment (standard or flexible)
 * @param  {Object} hosting [description]
 * @return {Object}         [description]
 */
const _mergeHostingConfigs = (...hostingConfigs) => {
	if (hostingConfigs.length == 0)
		return {}

	// 1. Make sure that the master hosting config is legit
	const masterConfig = hostingConfigs.slice(-1)[0]
	const scalingConfigCount = [masterConfig.automaticScaling, masterConfig.basicScaling, masterConfig.manualScaling].filter(x => x).length
	if (scalingConfigCount > 1) {
		console.log(error(`Invalid hosting config. The following properties are mutually exclusive: ${bold('automaticScaling')}, ${bold('basicScaling')}, ${bold('manualScaling')}. ${JSON.stringify(masterConfig, null, ' ')}`))
		throw new Error('Invalid hosting config.')
	}

	// 2. Make sure that the merged hosting config is consistent with respect to its env. (standard vs flexible)
	let hosting = obj.merge(...hostingConfigs)
	hosting = hosting || {}
	if (!hosting.env || hosting.env == 'standard') {
		delete hosting.network
		delete hosting.resources
		delete hosting.healthCheck
		if (hosting.automaticScaling) {
			delete hosting.automaticScaling.coolDownPeriod
			delete hosting.automaticScaling.cpuUtilization
			delete hosting.automaticScaling.minTotalInstances
			delete hosting.automaticScaling.maxTotalInstances
			delete hosting.automaticScaling.requestUtilization
			delete hosting.automaticScaling.diskUtilization
			delete hosting.automaticScaling.networkUtilization
		}
	} else { // flexible
		delete hosting.instanceClass
		if (hosting.automaticScaling) 
			delete hosting.automaticScaling.standardSchedulerSettings
	}

	// 3. Make sure that the merged hosting config has only inherited the master hosting config's scaling type
	const multipleScalingConfig = [hosting.automaticScaling, hosting.basicScaling, hosting.manualScaling].filter(x => x).length > 1
	if (multipleScalingConfig) {
		if (masterConfig.automaticScaling) {
			delete hosting.basicScaling
			delete hosting.manualScaling
		} else if (masterConfig.basicScaling) {
			delete hosting.automaticScaling
			delete hosting.manualScaling
		} else if (masterConfig.manualScaling) {
			delete hosting.basicScaling
			delete hosting.automaticScaling
		} else {
			delete hosting.automaticScaling
			delete hosting.basicScaling
			delete hosting.manualScaling
		}
	}

	return hosting
}

/**
 * Make sure the properties of the hosting config are consistent with the environment (standard or flexible)
 * @param  {Object} hosting [description]
 * @return {Object}         [description]
 */
const mergeAppJsons = (...appJsons) => {
	if (appJsons.length == 0)
		return {}

	// 1. Get the master config, i.e., the one that's supposed to override
	const masterConfig = appJsons.slice(-1)[0] || {}
	// 2. Make sure that the master hosting config is legit. 
	const masterHostingConfig = masterConfig.hosting || {}
	const scalingConfigCount = [masterHostingConfig.automaticScaling, masterHostingConfig.basicScaling, masterHostingConfig.manualScaling].filter(x => x).length
	if (scalingConfigCount > 1) {
		console.log(error(`Invalid hosting config. The following properties are mutually exclusive: ${bold('automaticScaling')}, ${bold('basicScaling')}, ${bold('manualScaling')}. ${JSON.stringify(masterHostingConfig, null, ' ')}`))
		throw new Error('Invalid hosting config.')
	}

	// 3. Merge appJsons into one
	let appJson = obj.merge(...appJsons.map(x => x || {}))
	// 4. Make sure that the merged hosting config is consistent with respect to its env. (standard vs flexible)
	let hosting = appJson.hosting || {}
	if (!hosting.env || hosting.env == 'standard') {
		delete hosting.network
		delete hosting.resources
		delete hosting.healthCheck
		if (hosting.automaticScaling) {
			delete hosting.automaticScaling.coolDownPeriod
			delete hosting.automaticScaling.cpuUtilization
			delete hosting.automaticScaling.minTotalInstances
			delete hosting.automaticScaling.maxTotalInstances
			delete hosting.automaticScaling.requestUtilization
			delete hosting.automaticScaling.diskUtilization
			delete hosting.automaticScaling.networkUtilization
		}
	} else { // flexible
		delete hosting.instanceClass
		if (hosting.automaticScaling) 
			delete hosting.automaticScaling.standardSchedulerSettings
	}

	// 3. Make sure that the merged hosting config has only inherited the master hosting config's scaling type
	const multipleScalingConfig = [hosting.automaticScaling, hosting.basicScaling, hosting.manualScaling].filter(x => x).length > 1
	if (multipleScalingConfig) {
		if (masterHostingConfig.automaticScaling) {
			delete hosting.basicScaling
			delete hosting.manualScaling
		} else if (masterHostingConfig.basicScaling) {
			delete hosting.automaticScaling
			delete hosting.manualScaling
		} else if (masterHostingConfig.manualScaling) {
			delete hosting.basicScaling
			delete hosting.automaticScaling
		} else {
			delete hosting.automaticScaling
			delete hosting.basicScaling
			delete hosting.manualScaling
		}
	}

	appJson.hosting = hosting
	return appJson
}

const resetHostingConfig = (hostingConfig) => {
	if (!hostingConfig)
		return 

	delete hostingConfig.network
	delete hostingConfig.resources
	delete hostingConfig.healthCheck
	delete hostingConfig.automaticScaling
	delete hostingConfig.basicScaling
	delete hostingConfig.manualScaling
	delete hostingConfig.instanceClass
}

/**
 * [description]
 * @param  {String}  appPath 			[description]
 * @param  {String}  options.env 		[description]
 * @param  {Boolean} options.envOnly 	[description]
 * @return {[type]}         			[description]
 */
const getHosting = (appPath, options={}) => getAppJson(appPath, options).then(appJson => (appJson || {}).hosting || {})

/**
 * [description]
 * @param  {String}  appPath 			[description]
 * @param  {String}  options.env 		[description]
 * @param  {Boolean} options.envOnly 	[description]
 * @return {[type]}         			[description]
 */
const getAppJson = (appPath, options={}) => {
	const main = file.getJson(path.join(appPath, 'app.json')).then(config => config || {})
	const second = options.env ? file.getJson(path.join(appPath, `app.${options.env}.json`)).then(config => config || {}) : Promise.resolve({})
	return Promise.all([main, second]).then(values => {
		if (options.env && options.envOnly) 
			return values[1] || {}
		else
			return mergeAppJsons(...values) || {}
	})
}

const hostingExists = (appPath, options={}) => {
	return getHosting(appPath, obj.merge(options, { envOnly: true })).then(hosting => hosting && Object.keys(hosting).length > 0) 
}

const saveHosting = (hosting, appPath, options={}) => Promise.all([
	file.getJson(path.join(appPath, 'app.json')),
	options.env ? file.getJson(path.join(appPath, `app.${options.env}.json`)) : Promise.resolve(null)
])
	.then(configs => {
		if (!options.env) { // Simple case of the app.json
			let updatedConfig = configs[0] || {}
			updatedConfig.hosting = obj.merge(hosting || {}, { 
				provider: 'google',
				service: (hosting || {}).service || 'default'
			})
			return file.write(path.join(appPath, 'app.json'), JSON.stringify(updatedConfig, null, '  '))
		} else { // more complex case of an additinal env. We need to diff. with the app.json to only keep the diff in the app.<env>.json
			let appJson = (configs[0] || {}).hosting || {}
			const action = (!appJson.provider || !appJson.service) 
				? ((() => {
					appJson.provider = appJson.provider || 'google'
					appJson.service = appJson.service || 'default'
					let updatedConfig = configs[0] || {}
					updatedConfig.hosting = obj.merge(updatedConfig.hosting || {}, { 
						provider: appJson.provider,
						service: appJson.service
					})
					return file.write(path.join(appPath, 'app.json'), JSON.stringify(updatedConfig, null, '  '))
				})())
				: Promise.resolve(null)

			return action.then(() => {
				const hostingDiff = obj.diff(appJson, hosting)
				let updatedConfig = configs[1] || {}
				updatedConfig.hosting = hostingDiff
				return file.write(path.join(appPath, `app.${options.env}.json`), JSON.stringify(updatedConfig, null, '  '))
			})
		}
	})

const saveAppJson = (appJson, appPath, options={}) => 
	file.getJson(path.join(appPath, 'app.json'))
		.then(mainAppJson => {
			mainAppJson = mainAppJson || {}
			if (!options.env) { // Simple case of the app.json
				if (appJson && !appJson.hosting) appJson.hosting = {}
				if (appJson && appJson.hosting) {
					appJson.hosting.provider = appJson.hosting.provider || 'google'
					appJson.hosting.service = appJson.hosting.service || 'default'
				}
				return file.write(path.join(appPath, 'app.json'), JSON.stringify(appJson, null, '  '))
			} else { // more complex case of an additinal env. We need to diff. with the app.json to only keep the diff in the app.<env>.json
				const action = (!mainAppJson.hosting || !mainAppJson.hosting.provider || !mainAppJson.hosting.service) 
					? ((() => {
						mainAppJson.hosting = mainAppJson.hosting || {}
						mainAppJson.hosting.provider = mainAppJson.provider || 'google'
						mainAppJson.hosting.service = mainAppJson.service || 'default'
						return file.write(path.join(appPath, 'app.json'), JSON.stringify(mainAppJson, null, '  '))
					})())
					: Promise.resolve(null)

				return action.then(() => {
					const hostingDiff = obj.diff(mainAppJson, appJson)
					return file.write(path.join(appPath, `app.${options.env}.json`), JSON.stringify(hostingDiff, null, '  '))
				})
			}
		})

const updateHosting = (hosting, appPath, options={}) => !appPath ? Promise.resolve(null) : Promise.all([
	file.getJson(path.join(appPath, 'app.json')),
	options.env ? file.getJson(path.join(appPath, `app.${options.env}.json`)) : Promise.resolve(null)
])
	.then(configs => {
		if (!options.env) { // Simple case of the app.json
			let updatedConfig = configs[0] || {}
			updatedConfig.hosting = obj.merge(updatedConfig.hosting, hosting || {})
			return file.write(path.join(appPath, 'app.json'), JSON.stringify(updatedConfig, null, '  '))
		} else { // more complex case of an additinal env. We need to diff. with the app.json to only keep the diff in the app.<env>.json
			let appJson = (configs[0] || {}).hosting || {}
			const action = (!appJson.provider || !appJson.service) 
				? ((() => {
					appJson.provider = appJson.provider || 'google'
					appJson.service = appJson.service || 'default'
					let updatedConfig = configs[0] || {}
					updatedConfig.hosting = obj.merge(updatedConfig.hosting || {}, { 
						provider: appJson.provider,
						service: appJson.service
					})
					return file.write(path.join(appPath, 'app.json'), JSON.stringify(updatedConfig, null, '  '))
				})())
				: Promise.resolve(null)

			return action.then(() => {
				let updatedConfig = configs[1] || {}
				updatedConfig.hosting = obj.merge(updatedConfig.hosting, hosting || {})
				const hostingDiff = obj.diff(appJson, updatedConfig.hosting)
				updatedConfig.hosting = hostingDiff
				return file.write(path.join(appPath, `app.${options.env}.json`), JSON.stringify(updatedConfig, null, '  '))
			})
		}
	})

const APP_JSON = ['name','id','inboundServices','instanceClass','network','zones','resources','runtime','runtimeChannel','threadsafe','vm','betaSettings','env','servingStatus','createdBy','createTime','diskUsageBytes','runtimeApiVersion','handlers','errorHandlers','libraries','apiConfig','envVariables','defaultExpiration','healthCheck','readinessCheck','livenessCheck','nobuildFilesRegex','deployment','versionUrl','endpointsApiService','automaticScaling','basicScaling','manualScaling']
const filterAppJsonFields = appJson => {
	if (!appJson)
		return {}
	return APP_JSON.reduce((acc, key) => {
		const v = appJson[key]
		if (v)
			acc[key] = v 
		return acc
	}, {})
}

module.exports = {
	appJson: {
		'get': getAppJson,
		save: saveAppJson
	},
	hosting: {
		'get': getHosting,
		save: saveHosting,
		update: updateHosting,
		exists: hostingExists,
		sanitize: obj => _mergeHostingConfigs(filterAppJsonFields(obj)),
		toYaml: obj => yaml.objToYaml(_mergeHostingConfigs(filterAppJsonFields(obj))),
		reset: resetHostingConfig
	},
	_:{
		mergeAppJsons
	}
}