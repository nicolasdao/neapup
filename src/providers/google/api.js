/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

const { obj: { merge }, promise: { retry } } = require('../../utils')
const gcp = require('./gcp')

const ALL_APIS = [
	'appengineflex.googleapis.com',
	'bigquery-json.googleapis.com',
	'bigquerydatatransfer.googleapis.com',
	'cloudtasks.googleapis.com',
	'iam.googleapis.com',
	'storage-api.googleapis.com',
	'storage-component.googleapis.com',
	'cloudfunctions.googleapis.com'
]

const _enableApi = (api, projectId, token, options) => retry(
	() => gcp.serviceAPI.enable(api, projectId, token, merge(options, { confirm: true })),
	() => true,
	{ retryAttempts: 5, retryInterval: [100, 800], ignoreFailure: true }
)

/**
 * [description]
 * @param  {String} 			projectId 	[description]
 * @param  {String|[String]} 	apis      	Must either be a string equal to 'all' or be an array of string containing valid Google APIs.
 * @param  {String} 			token     	[description]
 * @param  {Object} 			options   	[description]
 * @return {[type]}           				[description]
 */
const enableApis = (projectId, apis, token, options={}) => Promise.resolve(null).then(() => {
	if (!apis)
		throw new Error('Missing required argument \'apis\'')
	if (!token)
		throw new Error('Missing required argument \'token\'')

	if (apis == 'all')
		return Promise.all(ALL_APIS.map(api => _enableApi(api, projectId, token, merge(options, { confirm: true }))))
	else if (Array.isArray(apis)) {
		const unknownApis = apis.filter(api => !ALL_APIS.some(a => a == api))
		if (apis.length == 0)
			return
		else if (unknownApis.length > 0)
			throw new Error(`The following Google APIs are not supported: ${unknownApis.join(', ')}`)

		return Promise.all(apis.map(api => _enableApi(api, projectId, token, merge(options, { confirm: true }))))
	} else 
		throw new Error(`Wrong argument exception. 'apis' must either be equal to string 'all' or be an array of strings representing valid Google APIs. Instead, 'apis' is currently of type ${typeof apis} and its value is ${JSON.stringify(apis)}`)
})



module.exports = {
	enable: enableApis,
	'get': () => Promise.resolve(ALL_APIS)
}




