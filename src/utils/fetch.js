/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/
const fetch = require('node-fetch')
const { error, debugInfo } = require('./console')
const { delay } = require('./promise')

const errorHandler200 = (res, options) => {
	if (res && res.data && res.data.error) {
		const e = JSON.stringify(Object.assign(res.data.error, { status: res.status }), null, '  ')
		if (options.verbose)
			console.log(error(' ', e))
		throw new Error(e)
	} else
		return res
}

const MAX_RETRY = 10
const RETRY_INTERVAL = 6000
const OPS_INPROGRESS_FACTOR = 4 // this factor increases the RETRY_INTERVAL 
const errorHandler = (e, url, retryFn, retryCount, options={}) => {
	try {
		const er = JSON.parse(e.message) || {}
		const systemBug = er.code == 503 || er.code == 500
		const waitCauseOpsInProgress = er.code == 409 && (er.message || '').toLowerCase().indexOf('operation is already in progress') >= 0
		const maxRetry = MAX_RETRY
		const retryInterval = waitCauseOpsInProgress ? (OPS_INPROGRESS_FACTOR*RETRY_INTERVAL) : RETRY_INTERVAL
		if (systemBug || waitCauseOpsInProgress) {
			if (retryCount < maxRetry) {
				if (options.debug)
					console.log(debugInfo(`Google Cloud seems to struggle a bit. Retrying in ${retryInterval/1000} seconds (attempt no ${retryCount}).`))
				return delay(retryInterval).then(() => retryFn())
			}
			else {
				const api = getServiceAPI(url)
				console.log(error(`Google Cloud ${api} seems to be down. You may have to wait until Google fixes it. Details: `, e.message))
			}
		}

	} catch(_e) {
		(() => null)(_e)
	}
	throw e
}

const getServiceAPI = url => {
	if (url.indexOf('https://www.googleapis.com/oauth2') >=0)
		return 'OAuth API'
	else if (url.indexOf('https://cloudresourcemanager.googleapis.com') >=0)
		return 'Resource Manager API'
	else if (url.indexOf('https://console.cloud.google.com/billing') >=0)
		return 'Billing API'
	else if (url.indexOf('https://www.googleapis.com/storage') >=0)
		return 'Storage API'
	else if (url.indexOf('https://www.googleapis.com/upload/storage') >=0)
		return 'Storage API'
	else if (url.indexOf('https://appengine.googleapis.com') >=0)
		return 'App Engine API'
	else
		return null
}

const processResponse = (res, options={}) => {
	if (options.resParsingMethod == 'text')
		return res.text().then(data => ({ status: res.status, data }))
	else
		return res.json().then(data => ({ status: res.status, data }))
}

const getData = (url, headers={}, options={ verbose:true }) => Promise.resolve(null).then(() => {
	let { debug=false, verbose=true, retryCount=0 } = options || {}
	retryCount++
	return fetch(url, { method: 'GET', headers })
		.then(res => processResponse(res, options))
		.then(res => errorHandler200(res, { debug, verbose, retryCount }))
		.catch(e => errorHandler(e, url, () => getData(url, headers, { debug, verbose, retryCount }), retryCount, { debug } ))
})

const postData = (url, headers={}, body, options={ verbose:true }) => Promise.resolve(null).then(() => {
	let { debug=false, verbose=true, retryCount=0 } = options || {}
	retryCount++
	return fetch(url, { method: 'POST', headers, body })
		.then(res => processResponse(res, options))
		.then(res => errorHandler200(res, { debug, verbose, retryCount }))
		.catch(e => errorHandler(e, url, () => postData(url, headers, body, { debug, verbose, retryCount }), retryCount, { debug }))
})

const deleteData = (url, headers={}, body, options={ verbose:true }) => Promise.resolve(null).then(() => {
	let { debug=false, verbose=true, retryCount=0 } = options || {}
	retryCount++
	return fetch(url, { method: 'DELETE', headers, body })
		.then(res => processResponse(res, options))
		.then(res => errorHandler200(res, { debug, verbose, retryCount }))
		.catch(e => errorHandler(e, url, () => postData(url, headers, body, { debug, verbose, retryCount }), retryCount, { debug }))
})

const patchData = (url, headers={}, body, options={ verbose:true }) => Promise.resolve(null).then(() => {
	let { debug=false, verbose=true, retryCount=0 } = options || {}
	retryCount++
	return fetch(url, { method: 'PATCH', headers, body })
		.then(res => processResponse(res, options))
		.then(res => errorHandler200(res, { debug, verbose, retryCount }))
		.catch(e => errorHandler(e, url, () => patchData(url, headers, body, { debug, verbose, retryCount }), retryCount, { debug }))
})

module.exports = {
	'get': getData,
	post: postData,
	delete: deleteData,
	patch: patchData
}