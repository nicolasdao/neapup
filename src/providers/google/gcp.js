/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

// For more info about Google Cloud API, go to: 
// 	- Google Cloud Platform API: https://cloud.google.com/apis/docs/overview
// 	- Google Site Verification: https://developers.google.com/site-verification/v1/getting_started
// 	- Google Bucket IAM: https://cloud.google.com/storage/docs/json_api/v1/buckets/setIamPolicy
// 	- Google Bucket API: https://cloud.google.com/storage/docs/json_api/v1/buckets

const opn = require('opn')
const { encode: encodeQuery, stringify: formUrlEncode } = require('querystring')
const fetch = require('../../utils/fetch')
const { info, highlight, cmd, link, debugInfo, bold, error } = require('../../utils/console')
const { promise, identity, collection, obj: objectHelper, yaml } = require('../../utils/index')

const IAM_SERVICE_API = 'iam.googleapis.com'

// OAUTH
const OAUTH_TOKEN_URL = () => 'https://www.googleapis.com/oauth2/v4/token'
const GCP_CONSENT_PAGE = query => `https://accounts.google.com/o/oauth2/v2/auth?${query}`
// RESOURCE MANAGER
const PROJECT_URL = (projectId) => `https://cloudresourcemanager.googleapis.com/v1/projects${projectId ? `/${projectId}` : ''}`
const PROJECT_OPS_URL = operationId => `https://cloudresourcemanager.googleapis.com/v1/operations/${operationId}`
// BILLING
const BILLING_PAGE = projectId => `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}&folder&organizationId`
const BILLING_INFO_URL = projectId => `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`
// BUCKET
const BUCKET_URL = bucketName => `https://www.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}`
const BUCKET_FILE_URL = (bucketName, filepath) => `${BUCKET_URL(bucketName)}${ filepath ? `/o/${encodeURIComponent(filepath)}` : ''}`
const BUCKET_LIST_URL = projectId => `https://www.googleapis.com/storage/v1/b?project=${projectId}`
const BUCKET_UPLOAD_URL = (bucketName, fileName, projectId) => `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(fileName)}&project=${encodeURIComponent(projectId)}`
// APP ENGINE
const APP_ENG_DETAILS_URL = projectId => `https://appengine.googleapis.com/v1/apps/${projectId}`
const APP_ENG_CREATE_URL = () => 'https://appengine.googleapis.com/v1/apps'
const APP_ENG_SERVICE_URL = (projectId, service) => `https://appengine.googleapis.com/v1/apps/${projectId}/services${service ? `/${service}` : ''}`
const APP_ENG_SERVICE_VERSION_URL = (projectId, service, version) => `${APP_ENG_SERVICE_URL(projectId, service)}/versions${version ? `/${version}` : ''}`
const APP_ENG_DEPLOY_URL = (projectId, service='default') => APP_ENG_SERVICE_VERSION_URL(projectId, service)
const APP_ENG_OPS_STATUS_URL = (projectId, operationId) => `https://appengine.googleapis.com/v1/apps/${projectId}/operations/${operationId}`
const APP_ENG_MIGRATE_ALL_TRAFFIC = (projectId, service='default') => `https://appengine.googleapis.com/v1/apps/${projectId}/services/${service}/?updateMask=split`
const APP_ENG_DOMAINS_URL = (projectId, domain) => `https://appengine.googleapis.com/v1/apps/${projectId}/domainMappings${domain ? `/${domain}` : ''}`
const APP_ENG_CRON_UPDATE_URL = (projectId) => `https://appengine.google.com/api/cron/update?app_id=${projectId}`
const APP_ENG_QUEUE_UPDATE_URL = (projectId) => `https://appengine.google.com/api/queue/update?app_id=${projectId}`
/*eslint-disable */
const APP_ENG_DISPATCH_UPDATE_URL = (projectId) => `https://appengine.google.com/api/dispatch/update?app_id=${projectId}`
const APP_ENG_DOS_UPDATE_URL = (projectId) => `https://appengine.google.com/api/dos/update?app_id=${projectId}`
const APP_ENG_DATASTORE_UPDATE_URL = (projectId) => `https://appengine.google.com/api/datastore/index/add?app_id=${projectId}`
/*eslint-enable */
// SERVICE MGMT
const SERVICE_MGMT_URL = (serviceName, enable) => `https://servicemanagement.googleapis.com/v1/services/${serviceName ? `${serviceName}${enable || ''}`: ''}`
const SERVICE_MGMT_OPS_URL = (opsId) => `https://servicemanagement.googleapis.com/v1/operations/${opsId}`
// CLOUD BUILDS
const BUILD_URL = (projectId, buildId) => `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${buildId}`
// CLOUD TASK API
const TASK_QUEUE_URL = (projectId, locationId, queueName, taskName) => `https://cloudtasks.googleapis.com/v2beta3/projects/${projectId}/locations/${locationId}/queues${queueName ? `/${queueName}${taskName ? `/tasks/${taskName}` : ''}` : ''}`
// IAM API
const IAM_SERVICE_ACCOUNT_URL = (projectId, serviceEmail) => `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts${serviceEmail ? `/${encodeURIComponent(serviceEmail)}` : ''}`
const IAM_SERVICE_ACCOUNT_KEY_URL = (projectId, serviceEmail, keyId) => `${IAM_SERVICE_ACCOUNT_URL(projectId, serviceEmail)}/keys${keyId ? `/${keyId}` : ''}`
// BIGQUERY API
const BIGQUERY_DB_URL = projectId => `https://www.googleapis.com/bigquery/v2/projects/${projectId}/datasets`
const BIGQUERY_TABLES_URL = (projectId, db) => `https://www.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${db}/tables`

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - UTILS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const _showDebug = (msg, options={ debug:false }) => {
	const { debug } = options || {}
	if (debug)
		console.log(debugInfo(msg))
}

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (!params[p])
		throw new Error(`Parameter '${p}' is required.`)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - UTILS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - OAUTH TOKEN APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getOAuthToken = ({ code, client_id, client_secret, redirect_uri }, options={ debug:false }) => Promise.resolve(null).then(() => {
	_showDebug('Requesting new OAuth token from Google Cloud Platform.', options)
	_validateRequiredParams({ code, client_id, client_secret, redirect_uri })
	const body = formUrlEncode({
		code,
		client_id,
		client_secret,
		redirect_uri,
		grant_type: 'authorization_code'
	})
	
	return fetch.post(OAUTH_TOKEN_URL(), {
		'content-type': 'application/x-www-form-urlencoded',
		'content-length': body.length
	}, body)
})

const refreshOAuthToken = ({ refresh_token, client_id, client_secret }, options={ debug:false }) => {
	_showDebug('Requesting a refresh of existing OAuth token from Google Cloud Platform.', options)
	_validateRequiredParams({ refresh_token, client_id, client_secret })
	
	const body = formUrlEncode({
		refresh_token,
		client_id,
		client_secret,
		grant_type: 'refresh_token',
	})

	return fetch.post(OAUTH_TOKEN_URL(), {
		'content-type': 'application/x-www-form-urlencoded',
		'content-length': body.length
	}, body)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - OAUTH TOKEN APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - CONSENT APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const requestConsent = ({ client_id, redirect_uri, scope }, stopFn, timeout, options={ debug:false }) => Promise.resolve(null)
	.then(() => {
		_showDebug('Opening default browser on the Google Cloud Platform Consent page.', options)
		_validateRequiredParams({ client_id, redirect_uri, scope })
		const query = encodeQuery({
			client_id,
			redirect_uri,
			response_type: 'code',
			scope,
			access_type: 'offline',
			prompt: 'consent'
		})

		const googleConsentScreenUrl = GCP_CONSENT_PAGE(query)

		if(process.platform === 'darwin' || process.platform === 'win32') {
			opn(googleConsentScreenUrl)
			console.log(info('A Google Accounts login window has been opened in your default browser. Please log in there and check back here afterwards.'))
		} else {
			console.log(info(
				`We'll need you to grant us access to provision your ${highlight('Google Cloud Platform')} account in order to comunicate with their API.`,
				`To provision a dedicated set of tokens for ${cmd('neap')}, Go to ${link(googleConsentScreenUrl)} and grant access to Neap.`
			))
			throw new Error(`Can't browse to consent screen from platform ${process.platform} (currently supported platforms: 'darwin', 'win32').`)
		}
	})
	.then(() => promise.wait(stopFn, { timeout })) 


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - CONSENT APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - BILLING APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const setUpProjectBilling = (projectId, stopFn, timeout=300000, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, stopFn, timeout })
	return redirectToBillingPage(projectId, options)
}).then(() => promise.wait(stopFn, { timeout, interval:10000 })) 

const redirectToBillingPage = (projectId, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId })
	_showDebug('Opening default browser on the Google Cloud Platform project billing setup page.', options)
	const billingPage = BILLING_PAGE(projectId)

	if(process.platform === 'darwin' || process.platform === 'win32') 
		opn(billingPage)
	else {
		console.log(info(
			`We'll need you to enable billing on your ${highlight('Google Cloud Platform')} account for project ${bold(projectId)} in order to be able to deploy code on App Engine.`,
			`Go to ${link(billingPage)} to enable billing.`
		))
		throw new Error(`Can't browse to the billing page from platform ${process.platform} (currently supported platforms: 'darwin', 'win32').`)
	}

	return billingPage
})

const getProjectBillingInfo = (projectId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug('Requesting a project billing info from Google Cloud Platform.', options)

	return fetch.get(BILLING_INFO_URL(projectId), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	})
})

/**
 * This API is a hack to test whether or not billing has been enabled on a project without having to 
 * require access to the user's billing API. If the billing API fails with a '403 - The project to be billed is associated with an absent billing account.',
 * then this means the billing is not enabled.
 * @param  {[type]} projectId [description]
 * @param  {[type]} token     [description]
 * @param  {Object} options   [description]
 * @return {[type]}           [description]
 */
const testBillingEnabled = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug('Testing if billing is enabled by creating a dummy bucket on Google Cloud Platform.', options)

	const bucketName = `neap-bucket-healthcheck-${identity.new()}`.toLowerCase()
	return createBucket(bucketName, projectId, token, { debug: options.debug, verbose: false })
		.then(() => true)
		.catch(e => {
			try {
				const er = JSON.parse(e.message)
				if (er.code == 403 && (er.message || '').toLowerCase().indexOf('absent billing account') >= 0)
					return false
				else
					throw e	
			} catch(_e) { (() => {
				console.log(error(`Failed to determine whether or not billing is enabled on project ${bold(projectId)}. Go to ${link(BILLING_PAGE(projectId))} to enable billing in order to deploy code.`))
				throw e
			})(_e) }
		})
}) 

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - BILLING APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - PROJECT APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getProject = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	const opts = Object.assign({ debug:false, verbose:false }, options)
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting a project ${bold(projectId)} from Google Cloud Platform.`, opts)

	return fetch.get(PROJECT_URL(projectId), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}, { verbose: opts.verbose })
		.catch(e => {
			try {
				const er = JSON.parse(e.message)
				if (er.code == 403 || er.code == 404)
					return { status: er.code, data: null, message: er.message }
				else
					throw e
			} catch(_e) {(() => {
				throw e
			})(_e)}
		})
		.then(res => {
			const r = res || {}
			_showDebug(`Response received:\nStatus: ${r.status}\nData: ${r.data}`, opts)
			return res
		})
})

/**
 * [description]
 * @param  {[type]} token   				[description]
 * @param  {Boolean} options.onlyActive 	[description]
 * @return {[type]}         				[description]
 */
const listProjects = (token, options={}) => Promise.resolve(null).then(() => {
	_showDebug('Requesting a list of all projects from Google Cloud Platform.', options)
	_validateRequiredParams({ token })

	return fetch.get(`${PROJECT_URL()}?pageSize=2000`, {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	})
		.then(res => {
			if (res && res.data && res.data.projects && options.onlyActive)
				res.data.projects = res.data.projects.filter(p => p && p.lifecycleState == 'ACTIVE')
			return res
		})
})

/**
 * [description]
 * @param  {[type]}   name                                                   [description]
 * @param  {[type]}   projectId                                              [description]
 * @param  {[type]}   token                                                  [description]
 * @param  {Boolean}  options.confirm                                        [description]
 * @return {[type]}                                                          [description]
 */
const createProject = (name, projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ name, projectId, token })
	_showDebug(`Creating a new project on Google Cloud Platform called ${bold(name)} (id: ${bold(projectId)}).`, options)

	return fetch.post(PROJECT_URL(), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({
		name,
		projectId
	}), options)
		.then(res => {
			if (res.data && res.data.name)
				res.data.operationId = res.data.name.split('/').slice(-1)[0]
			return res
		})
		.then(res => options.confirm
			? promise.check(
				() => getResourceOperation(res.data.operationId, token, objectHelper.merge(options, { verbose: false })), 
				(res) => {
					if (res.data && res.data.name)
						return true
					else 
						return false
				})
			: res)
})

/**
 * [description]
 * @param  {[type]} projectId 				[description]
 * @param  {[type]} domain    				[description]
 * @param  {[type]} token     				[description]
 * @param  {Boolean} options.confirm   		[description]
 * @return {[type]}           				[description]
 */
const deleteProject = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId })
	_showDebug(`Deleting project ${bold(projectId)} in Google Cloud Platform.`, options)

	return fetch.delete(PROJECT_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null ,options)
})

const getResourceOperation = (opId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ opId, token })
	_showDebug('Requesting an resource\'s operation details from Google Cloud Platform.', options)

	return fetch.get(PROJECT_OPS_URL(opId), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - PROJECT APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - SERVICE MGMT APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const _enableOrDisableService = (service, projectId, token, enable, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, token, enable })
	_showDebug('Enabling or disabling a service API on Google Cloud Platform', options)

	return fetch.post(SERVICE_MGMT_URL(service, enable), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({
		consumerId: `project:${projectId}`
	})).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	}).then(res => {
		if (options.confirm) {
			return _checkServiceAPIOperation(res.data.operationId, token, null, null, options)
				.then(opRes => {
					if (opRes && opRes.error) {
						const msg = `Fail to determine the operation status when attempting to enable/disable service ${bold(service)}}`
						console.log(error(msg))
						throw new Error(msg)
					}
					res.data.operation = opRes.data
					return { status: opRes.status, data: res.data }
				})

		} else
			return res
	})
})

const enableServiceAPI = (service, projectId, token, options={ debug:false }) => _enableOrDisableService(service, projectId, token, ':enable', options)
const disableServiceAPI = (service, projectId, token, options={ debug:false }) => _enableOrDisableService(service, projectId, token, ':disable', options)

const serviceAPIExists = (service, projectId, token, options={ debug:false,  }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, token })
	_showDebug('Requesting a list of all projects from Google Cloud Platform.', options)

	return listServiceAPIs(projectId, token, options).then(res => {
		if (res && res.data && res.data.services)
			return { status: res.status, data: res.data.services.find(x => x.serviceName == service) }
		else 
			return { status: res.status, data: null }
	})
})

const listServiceAPIs = (projectId, token, options={ debug:false,  }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug('Requesting a list of all projects from Google Cloud Platform.', options)

	return fetch.get(SERVICE_MGMT_URL() + `?consumerId=project:${projectId}&pageSize=2000`, {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	})
})

const checkServiceOperationStatus = (operationId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ operationId, token })
	_showDebug('Requesting service operation status from Google Cloud Platform.', options)

	return fetch.get(SERVICE_MGMT_OPS_URL(operationId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, { verbose: false }).catch(e => {
		let err 
		try {
			err = JSON.parse(e.message)
		} catch(er) { err = e }

		if (err.status == 200) 
			return { status: 200, data: err }
		else
			throw e
	}).then(res => {
		_showDebug(`Operation response: ${options.debug ? JSON.stringify(res.data, null, ' ') : ''}.`, options)
		return res
	})
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - SERVICE MGMT APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - BUCKET APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBucketFile = (bucket, filepath, token, options={}) => Promise.resolve(null).then(() => {
	_showDebug('Requesting a bucket\'s file from Google Cloud Platform.', options)
	_validateRequiredParams({ token })

	const contentType = filepath ? _getContentType(filepath) : 'application/json'
	return fetch.get(`${BUCKET_FILE_URL(bucket, filepath)}${options._content ? '?alt=media' : ''}`, {
		Accept: contentType,
		Authorization: `Bearer ${token}`
	}, objectHelper.merge(options, { resParsingMethod: contentType == 'application/text' ? 'text' : 'json' }))
})

/**
 * [description]
 * @param  {[type]} bucket   						[description]
 * @param  {[type]} filepath 						[description]
 * @param  {[type]} token    						[description]
 * @param  {Object} options.createBucketIfNotExist  [description]
 * @param  {Object} options.projectId  				REQUIRED is 'createBucketIfNotExist' set to true
 * @return {[type]}          						[description]
 */
const getBucketFileContent = (bucket, filepath, token, options={}) => {
	if (options.createBucketIfNotExist) {
		_validateRequiredParams({ projectId: options.projectId })
		// 1. check the bucket exists
		return getBucketFile(bucket, null, token, objectHelper.merge(options, { _content: false, verbose: false }))
		// 1.1. if it does not exist, create it
			.catch(e => {
				try {
					const er = JSON.parse(e.message)
					if (er.code == 404)
						return createBucket(bucket, options.projectId, token)
							.then(() => ({ status: 200, data: '', error: true }))
				} catch(_e) {
					(() => {
						throw e
					})(_e)
				}
				throw e
			})
			.then(res => {
				if (res.error)
					return res 
				else 
					return getBucketFile(bucket, filepath, token, objectHelper.merge(options, { _content: true }))
			})
	} else 
		return getBucketFile(bucket, filepath, token, objectHelper.merge(options, { _content: true }))
}

const createBucket = (name, projectId, token, options={ debug:false, verbose:true }) => Promise.resolve(null).then(() => {
	const opts = Object.assign({ debug:false, verbose:true }, options)
	_validateRequiredParams({ projectId, name, token })
	_showDebug(`Creating a new bucket called ${bold(name)} in Google Cloud Platform's project ${bold(projectId)}.`, opts)

	let payload = { name }
	if (options.location)
		payload.location = options.location

	return fetch.post(BUCKET_LIST_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify(payload), opts)
		.then(res => {
			if (res && res.status == 409)
				_showDebug(`Bucket ${bold(name)} already exists.`, opts)
			return res
		})
})

const isBucketnameExists = (bucketName, options={}) => Promise.resolve(null).then(() => {
	_showDebug('Checking if bucket name exists.', options)
	_validateRequiredParams({ bucketName })

	return fetch.get(BUCKET_URL(bucketName), {
		'Content-Type': 'application/json'
	}, { verbose: false }).then(() => true).catch(err => {
		const e = JSON.parse(err.message)
		return e.code != 404
	})
})

const deleteBucket = (bucketName, token, options={}) => Promise.resolve(null).then(() => {
	_showDebug('Deleting bucket.', options)
	_validateRequiredParams({ bucketName, token })

	return fetch.delete(BUCKET_URL(bucketName), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null, { verbose: false })
})

const listBucketLocations = () => Promise.resolve(null).then(() => ({
	singleRegions: [
		{ name: 'northamerica-northeast1 (Montréal)', id: 'northamerica-northeast1' },
		{ name: 'us-central1 (Iowa)', id: 'us-central1' },
		{ name: 'us-east1 (South Carolina)', id: 'us-east1' },
		{ name: 'us-east4 (Northern Virginia)', id: 'us-east4' },
		{ name: 'us-west1 (Oregon)', id: 'us-west1' },
		{ name: 'us-west2 (Los Angeles)', id: 'us-west2' },
		{ name: 'southamerica-east1 (São Paulo)', id: 'southamerica-east1' },
		{ name: 'europe-north1 (Finland)', id: 'europe-north1' },
		{ name: 'europe-west1 (Belgium)', id: 'europe-west1' },
		{ name: 'europe-west2 (London)', id: 'europe-west2' },
		{ name: 'europe-west3 (Frankfurt)', id: 'europe-west3' },
		{ name: 'europe-west4 (Netherlands)', id: 'europe-west4' },
		{ name: 'asia-east1 (Taiwan)', id: 'asia-east1' },
		{ name: 'asia-east2 (Hong Kong)', id: 'asia-east2' },
		{ name: 'asia-northeast1 (Tokyo)', id: 'asia-northeast1' },
		{ name: 'asia-south1 (Mumbai)', id: 'asia-south1' },
		{ name: 'asia-southeast1 (Singapore)', id: 'asia-southeast1' },
		{ name: 'australia-southeast1 (Sydney)', id: 'australia-southeast1' }
	],
	multiRegions: [
		{ name: 'asia', id: 'asia' },
		{ name: 'eu', id: 'eu' },
		{ name: 'us', id: 'us' },
	]
}))

const listBuckets = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	const opts = Object.assign({ debug:false, verbose:true }, options)
	_validateRequiredParams({ projectId, token })
	_showDebug(`List all buckets in Google Cloud Platform's project ${bold(projectId)}.`, opts)

	return fetch.get(`${BUCKET_LIST_URL(projectId)}${options.cursor ? `?pageToken=${options.cursor}` : ''}`, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, opts).then(({ status, data }) => {
		const nextPageToken = (data || {}).nextPageToken
		const buckets = (data || {}).items || []
		if (nextPageToken) {
			const cursor = nextPageToken
			return listBuckets(projectId, token, objectHelper.merge(options, { cursor })).then(({ data }) => ({
				status,
				data: [...buckets, ...((data || {}).items || [])] 
			}))
		} else
			return { status, data: buckets }
	})
})

const CONTENT_TYPES = { 'zip': 'application/zip', 'json': 'application/json' }
const _getContentType = file => {
	const ext = ((file || '').split('.').slice(-1)[0] || '').trim().toLowerCase()
	return CONTENT_TYPES[ext] || 'application/text'
}

const uploadFileToBucket = (projectId, bucket, file, token, options={}) => Promise.resolve(null).then(() => {
	const { name: fileName, content } = file || {}
	_validateRequiredParams({ content, fileName, bucket, projectId, token })
	_showDebug(`Uploading a new file to Google Cloud Platform's project ${bold(projectId)} in bucket ${bold(bucket)}.`, options)

	const contentType = _getContentType(fileName)
	return fetch.post(BUCKET_UPLOAD_URL(bucket, fileName, projectId), {
		'Content-Type': contentType,
		'Content-Length': content.length,
		Authorization: `Bearer ${token}`
	}, content, objectHelper.merge(options, { resParsingMethod: contentType == 'application/text' ? 'text' : 'json' }))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - BUCKET APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - APP ENGINE APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////
/// 1. APP ENGINE APIS - MAIN -  START
///////////////////////////////////////////////////////////////////
const getAppDetails = (projectId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Getting the ${bold(projectId)}'s App Engine details from Google Cloud Platform.`, options)

	return fetch.get(APP_ENG_DETAILS_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, { verbose: false }).catch(e => {
		try {
			const er = JSON.parse(e.message)
			if (er.code == 404)
				return { status: 404, data: null }
			/*eslint-disable */
		} catch(err) {
			/*eslint-enable */
			throw e
		}
	})
})

const _validateAppRegions = (regionId='') => getAppRegions().then(regions => {
	if (regions.some(({ id }) => regionId == id))
		return
	else
		throw new Error(`Region ${bold(regionId)} is not supported by Google App Engine.`)
})

const getAppRegions = () => Promise.resolve([
	{ id: 'northamerica-northeast1', label: 'northamerica-northeast1 (Montréal)' },
	{ id: 'us-central', label: 'us-central (Iowa)' },
	{ id: 'us-west2', label: 'us-west2 (Los Angeles)' },
	{ id: 'us-east1', label: 'us-east1 (South Carolina)' },
	{ id: 'us-east4', label: 'us-east4 (Northern Virginia)' },
	{ id: 'southamerica-east1', label: 'southamerica-east1 (São Paulo)' },
	{ id: 'europe-west', label: 'europe-west (Belgium)' },
	{ id: 'europe-west2', label: 'europe-west2 (London)' },
	{ id: 'europe-west3', label: 'europe-west3 (Frankfurt)' },
	{ id: 'asia-northeast1', label: 'asia-northeast1 (Tokyo)' },
	{ id: 'asia-south1', label: 'asia-south1 (Mumbai)' },
	{ id: 'australia-southeast1', label: 'australia-southeast1 (Sydney)' }
])

const getInstanceTypes = () => Promise.resolve([
	{ id: 'F1', label: 'F1 (Memory: 128 MB, CPU: 600 MHz)', scalingType: 'auto', env:'standard' },
	{ id: 'F2', label: 'F2 (Memory: 256 MB, CPU: 1.2 GHz)', scalingType: 'auto', env:'standard' },
	{ id: 'F4', label: 'F4 (Memory: 512 MB, CPU: 2.4 GHz)', scalingType: 'auto', env:'standard' },
	{ id: 'F4_1G', label: 'F4_1G (Memory: 1024 MB, CPU: 2.4 GHz)', scalingType: 'auto', env:'standard' },
	{ id: 'B1', label: 'B1 (Memory: 128 MB, CPU: 600 MHz)', scalingType: 'manual, basic', env:'standard' },
	{ id: 'B2', label: 'B2 (Memory: 256 MB, CPU: 1.2 GHz)', scalingType: 'manual, basic', env:'standard' },
	{ id: 'B4', label: 'B4 (Memory: 512 MB, CPU: 2.4 GHz)', scalingType: 'manual, basic', env:'standard' },
	{ id: 'B4_1G', label: 'B4_1G (Memory: 1024 MB, CPU: 2.4 GHz)', scalingType: 'manual, basic', env:'standard' },
	{ id: 'B8', label: 'B8 (Memory: 1024 MB, CPU: 4.8 GHz)', scalingType: 'manual, basic', env:'standard' },
	{ id: 'f1-micro', label: 'Micro - Good for testing & dev', specs: [{ cores: 1, mem: 0.6 }, { cores: 1, mem: 1.7 } ], scalingType: 'auto, manual, basic', env:'flex' },
	{ id: 'n1-standard', label: 'Standard - Good for versatile tasks', specs: [{ cores: 1, mem: 3.75 } ,{ cores: 2, mem: 7.50 } ,{ cores: 4, mem: 15 } ,{ cores: 8, mem: 30 } ,{ cores: 16, mem: 60 } ,{ cores: 32, mem: 120 } ,{ cores: 64, mem: 240 } ,{ cores: 96, mem: 360 } ], scalingType: 'auto, manual, basic', env:'flex' },
	{ id: 'n1-highmem', label: 'High-Memory - Optimized for memory intensive tasks', specs: [{ cores: 2, mem: 13 } ,{ cores: 4, mem: 26 } ,{ cores: 8, mem: 52 } ,{ cores: 16, mem: 104 } ,{ cores: 32, mem: 208 } ,{ cores: 64, mem: 416 } ,{ cores: 96, mem: 624 } ], scalingType: 'auto, manual, basic', env:'flex' },
	{ id: 'n1-highcpu', label: 'High-CPU - Optimized for CPU intensive tasks', specs: [{ cores: 2, mem: 1.8 } ,{ cores: 4, mem: 3.6 } ,{ cores: 8, mem: 7.2 } ,{ cores: 16, mem: 14.4 } ,{ cores: 32, mem: 28.8 } ,{ cores: 64, mem: 57.6 } ,{ cores: 96, mem: 86.4 } ], scalingType: 'auto, manual, basic', env:'flex' },
	{ id: 'n1-ultramem', label: 'High-CPU-Memory - Optimized for CPU & Memory intensive tasks', specs: [{ cores: 40, mem: 961 } ,{ cores: 80, mem: 1922 } ,{ cores: 96, mem: 1433.6 } ,{ cores: 160, mem: 3844 } ], scalingType: 'auto, manual, basic', env:'flex' }
])

const createApp = (projectId, regionId, token, options={ debug:false }) => _validateAppRegions(regionId).then(() => {
	_validateRequiredParams({ projectId, regionId, token })
	_showDebug(`Creating a new App Engine in Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.post(APP_ENG_CREATE_URL(), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	},
	JSON.stringify({ 
		id: projectId,
		locationId: regionId
	})).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	})
})


const APP_JSON = ['id','inboundServices','instanceClass','network','zones','resources','runtime','runtimeChannel','threadsafe','vm','betaSettings','env','servingStatus','runtimeApiVersion','handlers','errorHandlers','libraries','apiConfig','envVariables','defaultExpiration','healthCheck','readinessCheck','livenessCheck','nobuildFilesRegex','deployment','endpointsApiService','automaticScaling','basicScaling','manualScaling']
const _filterAppJsonFields = appJson => {
	if (!appJson)
		return {}
	let cfg = APP_JSON.reduce((acc, key) => {
		const v = appJson[key]
		if (v)
			acc[key] = v 
		return acc
	}, {})

	if (cfg.betaSettings && (cfg.env == 'flexible' || cfg.env == 'flex'))
		delete cfg.betaSettings

	return cfg
}

/**
 * [description]
 * @param  {[type]}   projectId     [description]
 * @param  {[type]}   operationId   [description]
 * @param  {[type]}   token         [description]
 * @param  {[type]}   onSuccess     [description]
 * @param  {[type]}   onFailure     [description]
 * @param  {Function} options.interval      default: 4000
 * @param  {Function} options.timeOut      	default: 300000
 * @return {[type]}                 [description]
 */
const deployApp = (projectId, service, version, bucket, zipFile, fileCount, token, options={}) => Promise.resolve(null).then(() => {
	service = service || 'default'
	_validateRequiredParams({ bucket, projectId, zipFile, fileCount, version, token })

	const env = ((options.hostingConfig || {}).env || '').toLowerCase().trim() 
	let appJson = _filterAppJsonFields(Object.assign({}, options.hostingConfig || {}, {
		id: version,
		runtime: env == 'flex' || env == 'flexible' ? 'nodejs' : 'nodejs8',
		deployment: {
			zip: {
				sourceUrl: `https://storage.googleapis.com/${bucket}/${zipFile}`,
				filesCount: fileCount
			}
		}
	}))

	const payload = JSON.stringify(appJson, null, ' ')

	_showDebug(`Deploying service to Google Cloud Platform's project ${bold(projectId)}.\n${payload}`, options)

	return fetch.post(APP_ENG_DEPLOY_URL(projectId, service), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, payload, objectHelper.merge(options, { verbose: false }))
		.then(res => {
			_showDebug(`Deployment has started. Details: ${options.debug ? JSON.stringify(res.data, null, ' ') : ''}`, options)
			if (res.data && res.data.name)
				res.data.operationId = res.data.name.split('/').slice(-1)[0]
			return res
		})
		.then(res => {
			if (options.confirm) {
				const opts = objectHelper.merge(options, { interval: 15*1000, timeOut: 10*60*1000 })
				const action = _checkOperation(projectId, res.data.operationId, token, null, null, opts)
				
				return action
					.then(opRes => {
						if (opRes && opRes.error) {
							const msg = `Fail to determine the operation status for service ${bold(service)} version ${bold(version)}`
							console.log(error(msg))
							throw new Error(msg)
						}
						options.deployRetryCount = 0
						res.data.operation = opRes.data
						return { status: opRes.status, data: res.data }
					})

			} else {
				options.deployRetryCount = 0
				return res
			}
		})
		.catch(e => {
			let er = {}
			if (e.code && e.message)
				er = e 
			else {
				try {
					er = JSON.parse(e.message)
				} catch(_e) {
					(() => {
						throw e 
					})(_e)
				}
			}

			const retryExceeded = options.deployRetryCount && options.deployRetryCount > 30

			if (!retryExceeded && er.code == 409 && (er.message || '').toLowerCase().indexOf('operation is already in progress') >= 0) {
				if (!options.deployRetryCount)
					options.deployRetryCount = 1
				else
					options.deployRetryCount++

				_showDebug(`Retrying (attempt: ${options.deployRetryCount}) to deploy service to Google Cloud Platform's project ${bold(projectId)}.\n${payload}`, options)
				return promise.delay(10000).then(() => deployApp(projectId, service, version, bucket, zipFile, fileCount, token, options))
			}
			else {
				options.deployRetryCount = 0
				throw e
			}
		})
})

const checkOperationStatus = (projectId, operationId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ operationId, projectId, token })
	_showDebug(`Requesting operation status from Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(APP_ENG_OPS_STATUS_URL(projectId, operationId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, { verbose: false }).catch(e => {
		let err 
		try {
			err = JSON.parse(e.message)
		} catch(er) { err = e }

		if (err.status == 200) 
			return { status: 200, data: err }
		else
			throw e
	}).then(res => {
		_showDebug(`Operation response: ${options.debug ? JSON.stringify(res.data, null, ' ') : ''}.`, options)
		return res
	})
})

///////////////////////////////////////////////////////////////////
/// 1. APP ENGINE APIS - MAIN -  END
///////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////
/// 2. APP ENGINE APIS - SERVICES -  START
///////////////////////////////////////////////////////////////////

// 2.1. APP ENGINE APIS - SERVICES - MAIN - START
const getService = (projectId, service, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, token })
	_showDebug(`Requesting service ${bold(service)} for Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	return fetch.get(APP_ENG_SERVICE_URL(projectId, service), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, { verbose: false })
		.catch(e => {
			try {
				const er = JSON.parse(e.message)
				if (er.code == 403 || er.code == 404)
					return { status: er.code, data: null, message: er.message }
				else
					throw e
			} catch(_e) {(() => {
				throw e
			})(_e)}
		})
		.then(res => {
			const r = res || {}
			_showDebug(`Response received:\nStatus: ${r.status}\nData: ${r.data}`, options)
			return res
		})
})

const _sortServiceVersions = (service) => {
	if (service && service.split && service.split.allocations && service.versions && service.versions.length > 0) {
		const versionsWithTraffic = Object.keys(service.split.allocations).filter(v => service.split.allocations[v] > 0)
		const sortedVersions = collection.sortBy(service.versions, x => x.createTime, 'des').map(v => { v.traffic = 0; return v })
		if (versionsWithTraffic.length > 0) {
			const topVersions = collection.sortBy(
				sortedVersions.filter(v => versionsWithTraffic.some(x => x == v.id)).map(v => {
					v.traffic = service.split.allocations[v.id]
					return v
				}),
				x => x.traffic,
				'des'
			)
			service.versions = [...topVersions, ...sortedVersions.filter(v => !topVersions.some(tv => tv.id == v.id))]
		} else 
			service.versions = sortedVersions
	}
	return service
}

const _addServiceUrl = (service, projectId) => Promise.resolve(null).then(() => {
	if (service) 
		service.url = service.id == 'default' ? `https://${projectId}.appspot.com` : `https://${service.id}-dot-${projectId}.appspot.com`
	
	return service
})

const listServices = (projectId, token, options={ debug:false, includeVersions:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting list of services from Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	return fetch.get(APP_ENG_SERVICE_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, { verbose: options.verbose })
		.then(res => Promise.all(((res.data || {}).services || []).map(s => _addServiceUrl(s, projectId))).then(services => ({ status: res.status, services })))
		.then(({ status, services }) => {
			if (options.includeVersions && services.length > 0) {
				const getVersions = services.map(service => listServiceVersions(projectId, service.id, token, options).then(({ data }) => {
					service.versions = data.versions
					return _sortServiceVersions(service)
				}))
				return Promise.all(getVersions).then(services => ({ status, data: services || [] }))
			}	
			return { status, data: services || [] }
		})
})
// 2.1. APP ENGINE APIS - SERVICES - MAIN - END

// 2.2. APP ENGINE APIS - SERVICES - VERSIONS - START
const getServiceVersion = (projectId, service, version, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, version, token })
	_showDebug(`Requesting version ${bold(version)} from service ${bold(service)} for Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	const uri = `${APP_ENG_SERVICE_VERSION_URL(projectId, service, version)}${options.fullView ? '?view=FULL' : ''}`
	return fetch.get(uri, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	})
})

const listServiceVersions = (projectId, service, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, token })
	_showDebug(`Requesting list of all version for service ${bold(service)} Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	return fetch.get(APP_ENG_SERVICE_VERSION_URL(projectId, service) + '?pageSize=2000', {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	})
})

const getFullyQualifiedPropNames = obj => {
	if (!objectHelper.isObj(obj))
		return []
	
	return Object.keys(obj).reduce((acc, key) => {
		const v = obj[key]
		if (objectHelper.isObj(v))
			acc.push(...getFullyQualifiedPropNames(v).map(x => `${key}.${x}`))
		else 
			acc.push(key)
		return acc
	}, [])
}

const _createUpdateMaskQuery = patch => {
	if (!objectHelper.isObj(patch))
		return ''
	return `updateMask=${getFullyQualifiedPropNames(patch).join('%2C')}`
}

// doc: https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services.versions/patch
/**
 * 
 * @param  {[type]} projectId [description]
 * @param  {[type]} service   [description]
 * @param  {[type]} version   [description]
 * @param  {[type]} token     [description]
 * @param  {Boolean} options.confirm   		Default is false. When set to true, will wait for confrimation
 * @param  {Function} options.interval      default: 4000
 * @param  {Function} options.timeOut      	default: 300000
 * @return {[type]}           [description]
 */
const updateServiceVersion = (projectId, service, version, token, patch={}, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, service, version, token })
	const body =JSON.stringify(patch, null, ' ')
	_showDebug(`Updating a version for service ${bold(service)} on Google Cloud Platform's App Engine ${bold(projectId)}. Update details: ${body}`, options)

	const url = `${APP_ENG_SERVICE_VERSION_URL(projectId, service, version)}?${_createUpdateMaskQuery(patch)}`
	return fetch.patch(url, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, body, options).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	}).then(res => {
		if (options.confirm) {
			// NOTE: The reason we chose a different workflow if the updated field is 'servingStatus' is because there is a bug 
			// in the Google Operation API when we try to get the status of the operations for that field. It never returns a 'done'
			// status, though we can see in the Google console the operation has succeeded. 
			const action = (patch && patch.servingStatus)
				? _checkVersionServingStatus(projectId, service, version, patch.servingStatus, token, null, null, options)
				: _checkOperation(projectId, res.data.operationId, token, null, null, options)
				
			return action
				.then(opRes => {
					if (opRes && opRes.error) {
						const msg = `Fail to determine the operation status for service ${bold(service)} version ${bold(version)}`
						console.log(error(msg))
						throw new Error(msg)
					}
					res.data.operation = opRes.data
					return { status: opRes.status, data: res.data }
				})

		} else
			return res
	})
})

/**
 * 
 * @param  {[type]} projectId [description]
 * @param  {[type]} service   [description]
 * @param  {[type]} version   [description]
 * @param  {[type]} token     [description]
 * @param  {Boolean} options.confirm   Default is false. When set to true, will wait for confrimation
 * @return {[type]}           [description]
 */
const minimizeBilling = (projectId, service, version, token, options={}) => getServiceVersion(projectId, service, version, token, options).then(({ data }) => {
	if (data.servingStatus == 'STOPPED' && !options.force)
		return { status: 200, data: { versionStatus: 'STOPPED' } }
	
	const isStandard = !data.env || data.env == 'standard'
	const isAutoScaling = data.automaticScaling
	const patch = isStandard && isAutoScaling 
		? { automaticScaling: { minIdleInstances: 0, standardSchedulerSettings: { minInstances: 0 } } }
		: { servingStatus: 'STOPPED' }

	return updateServiceVersion(projectId, service, version, token, patch, objectHelper.merge(options, { verbose: false }))
})

/**
 * 
 * @param  {[type]} projectId [description]
 * @param  {[type]} service   [description]
 * @param  {[type]} version   [description]
 * @param  {[type]} token     [description]
 * @param  {Boolean} options.confirm   Default is false. When set to true, will wait for confrimation
 * @return {[type]}           [description]
 */
const stopVersion = (projectId, service, version, token, options={}) => minimizeBilling(projectId, service, version, token, options)
	.then(res => {
		if (res && res.data)
			res.data.versionStatus = 'STOPPED'
		return res
	})

/**
 * 
 * @param  {[type]} projectId [description]
 * @param  {[type]} service   [description]
 * @param  {[type]} version   [description]
 * @param  {[type]} token     [description]
 * @param  {Boolean} options.confirm   Default is false. When set to true, will wait for confrimation
 * @return {[type]}           [description]
 */
const startVersion = (projectId, service, version, token, options={}) => 
	getServiceVersion(projectId, service, version, token, objectHelper.merge(options, { fullView: true })).then(({ data }) => {
		_validateRequiredParams({ projectId, service, version, token })
		const isStandard = !data.env || data.env == 'standard'
		if (isStandard || (data.servingStatus == 'SERVING' && !options.force))
			return { status: 200, data: { versionStatus: 'SERVING' } }

		const patch = { servingStatus: 'SERVING' }
		return updateServiceVersion(projectId, service, version, token, patch, objectHelper.merge(options, { verbose: false }))
			.then(res => {
				if (res && res.data)
					res.data.versionStatus = 'SERVING'
				return res
			})
			.then(res => {
				if (options.redeploy) {
					const bucket = `neapup-${version}`//neapup-v20180928-021122-42
					const fileCount = version.split('-').slice(-1)[0] * 1
					let opts = objectHelper.merge(options, { confirm: true })
					opts.hostingConfig = data
					opts.hostingConfig.servingStatus == 'SERVING'
					return deployApp(projectId, service, version, bucket, 'neapup.zip', fileCount, token, opts)
				} else
					return res
			})
	})

const deleteServiceVersion = (projectId, service, version, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, service, version, token })
	_showDebug(`Deleting a version for service ${bold(service)} on Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	return fetch.delete(APP_ENG_SERVICE_VERSION_URL(projectId, service, version), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	})
})

const migrateAllTraffic = (projectId, service, version, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, version, projectId, token })
	_showDebug(`Requesting operation status from Google Cloud Platform's project ${bold(projectId)}.`, options)

	let allocations = {}
	allocations[version] = 1

	return fetch.patch(APP_ENG_MIGRATE_ALL_TRAFFIC(projectId, service), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({ split: { allocations } })).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	})
})

/**
 * [description]
 * @param  {[type]} projectId 				[description]
 * @param  {[type]} domain    				[description]
 * @param  {[type]} token     				[description]
 * @param  {Boolean} options.confirm   		[description]
 * @return {[type]}           				[description]
 */
const deleteService = (projectId, service, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, service })
	_showDebug(`Deleting service for Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.delete(APP_ENG_SERVICE_URL(projectId, service), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null ,options)
		.then(res => {
			if (res.data && res.data.name)
				res.data.operationId = res.data.name.split('/').slice(-1)[0]
			return res
		})
		.then(res => {
			if (options.confirm) {
				return _checkOperation(projectId, res.data.operationId, token, null, null, options)
					.then(opRes => {
						if (opRes && opRes.error) {
							const msg = `Fail to determine the operation status for service ${bold(service)} in project ${bold(projectId)}`
							console.log(error(msg))
							throw new Error(msg)
						}
						res.data.operation = opRes.data
						return { status: opRes.status, data: res.data }
					})

			} else
				return res
		})
})

// 2.2. APP ENGINE APIS - SERVICES - VERSIONS - END


///////////////////////////////////////////////////////////////////
/// 2. APP ENGINE APIS - SERVICES -  END
///////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////
/// 3. APP ENGINE APIS - DOMAINS -  START
///////////////////////////////////////////////////////////////////

const getDomain = (projectId, domain, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, domain, token })
	_showDebug(`Requesting all the domains for Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(APP_ENG_DOMAINS_URL(projectId, domain), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
		.then(res => ({ status: res.status, data: res.data || {} }))
})

const listDomains = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting all the domains for Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(APP_ENG_DOMAINS_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
		.then(res => ({ status: res.status, data: (res.data || {}).domainMappings || [] }))
})

/**
 * [description]
 * @param  {[type]} projectId 				[description]
 * @param  {[type]} domain    				[description]
 * @param  {[type]} token     				[description]
 * @param  {Boolean} options.confirm   		[description]
 * @return {[type]}           				[description]
 */
const deleteDomain = (projectId, domain, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, domain, token })
	_showDebug(`Requesting all the domains for Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.delete(APP_ENG_DOMAINS_URL(projectId, domain), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null ,options)
		.then(res => {
			if (res.data && res.data.name)
				res.data.operationId = res.data.name.split('/').slice(-1)[0]
			return res
		})
		.then(res => {
			if (options.confirm) {
				return _checkOperation(projectId, res.data.operationId, token, null, null, options)
					.then(opRes => {
						if (opRes && opRes.error) {
							const msg = `Fail to determine the operation status for domain ${bold(domain)} in project ${bold(projectId)}`
							console.log(error(msg))
							throw new Error(msg)
						}
						res.data.operation = opRes.data
						return { status: opRes.status, data: res.data }
					})

			} else
				return res
		})
})

///////////////////////////////////////////////////////////////////
/// 3. APP ENGINE APIS - DOMAINS -  END
///////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////
/// 4. APP ENGINE APIS - CONFIGS -  START
///////////////////////////////////////////////////////////////////

const _getYamlConfig = (projectId, fileName, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, fileName, token })
	_showDebug(`Getting ${fileName} for Google Cloud Platform's project ${bold(projectId)}.`, options)

	const filePrefix = fileName.split('.')[0].trim()
	return getBucketFileContent(`${projectId}-neapup-${filePrefix}`, fileName, token, { projectId, createBucketIfNotExist: true, verbose: false })
		.then(({ status, data }) => data && data.indexOf && data.indexOf('No such object:') < 0 ? { status, data: (yaml.yamlToObj(data) || {}).cron || [] } : { status, data: [] })
		.catch(e => {
			try {
				const er = JSON.parse(e.message)
				if (er.code == 404)
					return { status: 404, data: [] }
			} catch(_e) {
				(() => {
					throw e
				})(_e)
			}
			throw e
		})
})

const getCron = (projectId, token, options={}) => _getYamlConfig(projectId, 'cron.yaml',token, options)
const getQueues = (projectId, token, options={}) => _getYamlConfig(projectId, 'queue.yaml',token, options)

const updateCron = (projectId, cronJobs, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Updating CRON job for Google Cloud Platform's project ${bold(projectId)}.`, options)

	const bodyForGoogle = cronJobs && cronJobs.length > 0 
		? yaml.objToYaml({ cron: cronJobs.map(c => {
			let cj = {
				description: c.description || '',
				url: c.url || '/',
				target: c.target || 'default',
				schedule: c.schedule
			}
			if (c.timezone)
				cj.timezone = c.timezone
			if (c.retryParameters)
				cj.retry_parameters = c.retryParameters
			return cj
		})})
		: 'cron:'

	const bodyForNeapUp = cronJobs && cronJobs.length > 0 ? yaml.objToYaml({ cron: cronJobs }) : 'cron:' 

	return fetch.post(APP_ENG_CRON_UPDATE_URL(projectId), {
		'Content-Type': 'application/octet-stream',
		'X-appcfg-api-version': '1',
		'content-length': bodyForGoogle.length,
		Authorization: `Bearer ${token}`
	}, bodyForGoogle, objectHelper.merge(options, { resParsingMethod: 'text' }))
		.then(res => {
			return { status: res.status, data: res.data || {} }
		})
		.then(res => uploadFileToBucket(projectId, `${projectId}-neapup-cron`, { name: 'cron.yaml', content: bodyForNeapUp }, token, options).then(() => res))
})

const updateQueue = (projectId, queues, token, options={}) => getAppDetails(projectId, token, options)
	.then(({ data: { locationId: projectLocationId } }) => {
		const locationId = AVAILABLE_TASK_API_REGIONS[projectLocationId]

		if (!locationId)
			throw new Error(`The Cloud Task API is in beta and currently does not support ${bold(projectLocationId)}. Allowed locationId: ${bold('us-central1')} (Iowa), ${bold('us-east1')} (South Carolina), ${bold('europe-west1')} (Belgium), ${bold('asia-northeast1')} (Tokyo).`)

		_validateRequiredParams({ projectId, token })
		_showDebug(`Updating Task queues job for Google Cloud Platform's project ${bold(projectId)}.`, options)

		const bodyForGoogle = queues && queues.length > 0 
			? yaml.objToYaml({ queue: queues.map(c => {
				let cj = {
					name: c.name,
					target: c.target || 'default',
					rate: c.rate,
					bucket_size: c.bucketSize || 5,
					max_concurrent_requests: c.maxConcurrentRequests || 1000
				}
				if (c.retryParameters)
					cj.retry_parameters = c.retryParameters
				return cj
			})})
			: 'queue:'

		const bodyForNeapUp = queues && queues.length > 0 ? yaml.objToYaml({ cron: queues }) : 'queue:' 

		return fetch.post(APP_ENG_QUEUE_UPDATE_URL(projectId), {
			'Content-Type': 'application/octet-stream',
			'X-appcfg-api-version': '1',
			'content-length': bodyForGoogle.length,
			Authorization: `Bearer ${token}`
		}, bodyForGoogle, objectHelper.merge(options, { resParsingMethod: 'text' }))
			.then(res => {
				return { status: res.status, data: res.data || {} }
			})
			.then(res => uploadFileToBucket(projectId, `${projectId}-neapup-queue`, { name: 'queue.yaml', content: bodyForNeapUp }, token, options).then(() => res))
	})


///////////////////////////////////////////////////////////////////
/// 4. APP ENGINE APIS - CONFIGS -  END
///////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - APP ENGINE APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - BUILD APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBuild = (projectId, buildId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, buildId, token })
	_showDebug(`Requesting a project ${bold(projectId)}'s build details from Google Cloud Platform.`, options)

	return fetch.get(BUILD_URL(projectId, buildId), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - BUILD APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - CLOUD TASK APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// As of Oct 2018, the Cloud Task API is in beta and only support the following locations:
// us-east1, us-central1, europe-west1, and asia-northeast1
const AVAILABLE_TASK_API_REGIONS = {
	'us-central1': 'us-central1',
	'us-central': 'us-central1',
	'us-east1': 'us-east1',
	'us-east': 'us-east1',
	'europe-west1': 'europe-west1',
	'europe-west': 'europe-west1',
	'asia-northeast1': 'asia-northeast1',
	'asia-northeast': 'asia-northeast1'
}

const listTaskQueues = (projectId, token, options={}) => getAppDetails(projectId, token, options)
	.then(({ data: { locationId: projectLocationId } }) => {
		const locationId = AVAILABLE_TASK_API_REGIONS[projectLocationId]

		if (!locationId)
			throw new Error(`The Cloud Task API is in beta and currently does not support ${bold(projectLocationId)}. Allowed locationId: ${bold('us-central1')} (Iowa), ${bold('us-east1')} (South Carolina), ${bold('europe-west1')} (Belgium), ${bold('asia-northeast1')} (Tokyo).`)

		_validateRequiredParams({ projectId, locationId, token })
		_showDebug(`Requesting all queues from Google Cloud Platform's project ${bold(projectId)}.`, options)

		return fetch.get(TASK_QUEUE_URL(projectId, locationId), {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, options)
			.then(res => ({ status: res.status, data: res.data || {} }))
	})

// This method is a bit of a pain as it does not provide a rate config as granular as the legacy 'updateQueue' API
/**
 * [description]
 * @param  {[type]} projectId               [description]
 * @param  {[type]} service                 [description]
 * @param  {[type]} queue                   [description]
 * @param  {Number} maxDispatchesPerSecond  Accepts decimal to. For example, 0.1 means that the maximum rate is to process the queue every 10 sec, i.e., 6/m (6 times per minutes) 
 * @param  {[type]} maxConcurrentDispatches [description]
 * @param  {[type]} token                   [description]
 * @param  {Object} options                 [description]
 * @return {[type]}                         [description]
 */
const createTaskQueue = (projectId, service, queue, maxDispatchesPerSecond, maxConcurrentDispatches, token, options={}) => getAppDetails(projectId, token, options)
	.then(({ data: { locationId: projectLocationId } }) => {
		const locationId = AVAILABLE_TASK_API_REGIONS[projectLocationId]

		if (!locationId)
			throw new Error(`The Cloud Task API is in beta and currently does not support ${bold(projectLocationId)}. Allowed locationId: ${bold('us-central1')} (Iowa), ${bold('us-east1')} (South Carolina), ${bold('europe-west1')} (Belgium), ${bold('asia-northeast1')} (Tokyo).`)

		_validateRequiredParams({ projectId, queue, locationId, token })
		_showDebug(`Creating a new queue in Google Cloud Platform's project ${bold(projectId)}.`, options)

		return fetch.post(TASK_QUEUE_URL(projectId, locationId), {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, JSON.stringify({
			name: `projects/${projectId}/locations/${locationId}/queues/${queue}`,
			rateLimits: {
				maxDispatchesPerSecond: maxDispatchesPerSecond || 500,
				maxConcurrentDispatches: maxConcurrentDispatches || 1000
			},
			appEngineHttpQueue: {
				appEngineRoutingOverride: {
					service: service || 'default'
				}
			}
		}), options)
			.then(res => ({ status: res.status, data: res.data || {} }))
	})

const deleteTaskQueue = (projectId, queue, token, options={}) => getAppDetails(projectId, token, options)
	.then(({ data: { locationId: projectLocationId } }) => {
		const locationId = AVAILABLE_TASK_API_REGIONS[projectLocationId]

		if (!locationId)
			throw new Error(`The Cloud Task API is in beta and currently does not support ${bold(projectLocationId)}. Allowed locationId: ${bold('us-central1')} (Iowa), ${bold('us-east1')} (South Carolina), ${bold('europe-west1')} (Belgium), ${bold('asia-northeast1')} (Tokyo).`)

		_validateRequiredParams({ projectId, queue, locationId, token })
		_showDebug(`Deleting a queue in Google Cloud Platform's project ${bold(projectId)}.`, options)

		return fetch.delete(TASK_QUEUE_URL(projectId, locationId, queue), {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, null, options)
			.then(res => ({ status: res.status, data: res.data || {} }))
	})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - CLOUD TASK APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - BIGQUERY APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listBigQueryDBs = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting all DBs from Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(BIGQUERY_DB_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
		.then(res => ({ status: res.status, data: (res.data || {}).datasets || [] }))
})

const listBigQueryTables = (projectId, db, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, db, token })
	_showDebug(`Requesting all DB's tables from Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(BIGQUERY_TABLES_URL(projectId, db), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
		.then(res => ({ status: res.status, data: (res.data || {}).tables || [] }))
})

// // This method is a bit of a pain as it does not provide a rate config as granular as the legacy 'updateQueue' API
// /**
//  * [description]
//  * @param  {[type]} projectId               [description]
//  * @param  {[type]} service                 [description]
//  * @param  {[type]} queue                   [description]
//  * @param  {Number} maxDispatchesPerSecond  Accepts decimal to. For example, 0.1 means that the maximum rate is to process the queue every 10 sec, i.e., 6/m (6 times per minutes) 
//  * @param  {[type]} maxConcurrentDispatches [description]
//  * @param  {[type]} token                   [description]
//  * @param  {Object} options                 [description]
//  * @return {[type]}                         [description]
//  */
// const createTaskQueue = (projectId, service, queue, maxDispatchesPerSecond, maxConcurrentDispatches, token, options={}) => getAppDetails(projectId, token, options)
// 	.then(({ data: { locationId: projectLocationId } }) => {
// 		const locationId = AVAILABLE_TASK_API_REGIONS[projectLocationId]

// 		if (!locationId)
// 			throw new Error(`The Cloud Task API is in beta and currently does not support ${bold(projectLocationId)}. Allowed locationId: ${bold('us-central1')} (Iowa), ${bold('us-east1')} (South Carolina), ${bold('europe-west1')} (Belgium), ${bold('asia-northeast1')} (Tokyo).`)

// 		_validateRequiredParams({ projectId, queue, locationId, token })
// 		_showDebug(`Creating a new queue in Google Cloud Platform's project ${bold(projectId)}.`, options)

// 		return fetch.post(TASK_QUEUE_URL(projectId, locationId), {
// 			'Content-Type': 'application/json',
// 			Authorization: `Bearer ${token}`
// 		}, JSON.stringify({
// 			name: `projects/${projectId}/locations/${locationId}/queues/${queue}`,
// 			rateLimits: {
// 				maxDispatchesPerSecond: maxDispatchesPerSecond || 500,
// 				maxConcurrentDispatches: maxConcurrentDispatches || 1000
// 			},
// 			appEngineHttpQueue: {
// 				appEngineRoutingOverride: {
// 					service: service || 'default'
// 				}
// 			}
// 		}), options)
// 			.then(res => ({ status: res.status, data: res.data || {} }))
// 	})

// const deleteTaskQueue = (projectId, queue, token, options={}) => getAppDetails(projectId, token, options)
// 	.then(({ data: { locationId: projectLocationId } }) => {
// 		const locationId = AVAILABLE_TASK_API_REGIONS[projectLocationId]

// 		if (!locationId)
// 			throw new Error(`The Cloud Task API is in beta and currently does not support ${bold(projectLocationId)}. Allowed locationId: ${bold('us-central1')} (Iowa), ${bold('us-east1')} (South Carolina), ${bold('europe-west1')} (Belgium), ${bold('asia-northeast1')} (Tokyo).`)

// 		_validateRequiredParams({ projectId, queue, locationId, token })
// 		_showDebug(`Deleting a queue in Google Cloud Platform's project ${bold(projectId)}.`, options)

// 		return fetch.delete(TASK_QUEUE_URL(projectId, locationId, queue), {
// 			'Content-Type': 'application/json',
// 			Authorization: `Bearer ${token}`
// 		}, null, options)
// 			.then(res => ({ status: res.status, data: res.data || {} }))
// 	})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - BIGQUERY APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - IAM APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const _enableIamApiIfError = (err, projectId, token, next, options={}) => {
	try {
		const er = JSON.parse(err.message)
		if (er.code == 403 && er.message && er.message.toLowerCase().indexOf('it is disabled. enable it by visiting') >= 0) 
			return enableServiceAPI(IAM_SERVICE_API, projectId, token, objectHelper.merge(options, { confirm: true }))
				.then(() => next())
		else
			throw err
	} catch(e) {
		(() => {
			throw err
		})(e)
	}
}

const getProjectIAMpolicies = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting all service accounts from Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.post(`${PROJECT_URL(projectId)}:getIamPolicy`, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null, options)
		.then(res => ({ status: res.status, data: res.data || {} }))
})

const _attachPoliciesToServiceAccounts = (accounts=[], bindings=[]) => {
	accounts = (accounts || []).map(a => {
		a.roles = []
		return a
	})

	bindings.forEach(({ role, members=[] }) => {
		const serviceAccountEmails = members.filter(m => m.indexOf('serviceAccount:') == 0).map(m => m.replace('serviceAccount:', ''))
		if (serviceAccountEmails.length > 0)
			accounts.filter(a => serviceAccountEmails.some(email => email == a.email)).forEach(a => a.roles.push(role))
	})

	return accounts
}

const listUsers = (projectId, token, options={}) => getProjectIAMpolicies(projectId, token, options).then(({ status, data: policy }) => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting all users from Google Cloud Platform's project ${bold(projectId)}.`, options)

	const users = ((policy || {}).bindings || []).filter(b => b.members && b.members.some(m => m && m.indexOf('user:') == 0)).reduce((acc,b) => {
		b.members.filter(m => m && m.indexOf('user:') == 0).map(m => m.replace('user:', '')).forEach(email => {
			const roles = acc[email] || []
			roles.push(b.role)
			acc[email] = roles
		})

		return acc
	}, {})

	const data = []
	Object.keys(users).forEach(email => data.push({ user: email, roles: users[email] }))

	return { status, data }
})

const listServiceAccounts = (projectId, token, options={}) => getProjectIAMpolicies(projectId, token, options).then(({ data: policy }) => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting all service accounts from Google Cloud Platform's project ${bold(projectId)}.`, options)

	policy = policy || {}
	return fetch.get(IAM_SERVICE_ACCOUNT_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, options)
		.then(res => ({ status: res.status, data: _attachPoliciesToServiceAccounts((res.data || {}).accounts || [], policy.bindings)}))
		.then(res => {
			if (options.includeKeys) {
				const svcAccountsWithRoles = (res.data || []).filter(a => a.roles && a.roles.length > 0)
				if (svcAccountsWithRoles.length > 0)
					return Promise.all(svcAccountsWithRoles.map(a => listServiceAccountKeys(projectId, a.email, token, options)))
						.then(values => {
							values.forEach(({ data: keys }) => {
								if (keys && keys.length > 0) 
									keys.forEach(({ name, validAfterTime: created }) => {
										const keyId = name.split('/').slice(-1)[0]
										const serviceAccountEmail = name.replace(`/keys/${keyId}`, '').split('/').slice(-1)[0]
										res.data.filter(a => a.email == serviceAccountEmail).forEach(a => {
											a.keys = a.keys || []
											a.keys.push({ id: keyId, created })
										})
									})
							})
							res.data.forEach(a => {
								if (!a.keys)
									a.keys = []
								a.keys = collection.sortBy(a.keys, x => x.created, 'des')
							})
							return res
						})
				else {
					res.data.forEach(a => a.keys = [])
					return res
				}
			} else 
				return res
		})
		.catch(e => {
			if (!options.skipEnableApi)
				return _enableIamApiIfError(e, projectId, token, () => listServiceAccounts(projectId, token, objectHelper.merge(options, { skipEnableApi: true })), options)
			else 
				throw e
		})
})

/**
 * [description]
 * @param  {[type]}   projectId                     [description]
 * @param  {[type]}   name                          [description]
 * @param  {[type]}   label                         [description]
 * @param  {[type]}   token                         [description]
 * @param  {Object}   options.roles                	[description]
 * @param  {Object}   options.createJsonKey        	[description]
 * @param  {Object}   options.skipEnableApi        	[description]
* @return {[type]}                                 	[description]
 */
const createServiceAccount = (projectId, name, label, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, name, token })
	_showDebug(`Creating a service account in Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.post(IAM_SERVICE_ACCOUNT_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({
		accountId: (label ? `${label}-${identity.new()}` : `neapup-${identity.new()}`).toLowerCase(),
		serviceAccount: {
			displayName: name
		}
	}), objectHelper.merge(options, { verbose: false }))
		.then(res => ({ status: res.status, data: res.data || {} }))
		.then(res => {
			if (options.roles && options.roles.length > 0 && res.data.email)
				return addRolesToServiceAccount(projectId, res.data.email, options.roles, token, options)
					.then(({ data }) => {
						res.data.policy = data
						return res
					})
			else
				return res
		})
		.then(res => {
			if (options.createJsonKey) {
				return generateServiceAccountKey(projectId, res.data.email, token, options).then(({ data }) => {
					res.data.jsonKey = data 
					return res
				})
			} else
				return res 
		})
		.catch(e => {
			if (!options.skipEnableApi)
				return _enableIamApiIfError(e, projectId, token, () => createServiceAccount(projectId, name, label, token, objectHelper.merge(options, { skipEnableApi: true })), options)
			else 
				throw e
		})
})

const addRolesToServiceAccount = (projectId, serviceEmail, roles, token, options={}) => 
	_addRoles(projectId, serviceEmail, roles, token, objectHelper.merge(options, { serviceAccount: true }))

const addRolesToUser = (projectId, userEmail, roles, token, options={}) => 
	_addRoles(projectId, userEmail, roles, token, objectHelper.merge(options, { serviceAccount: false }))

const removeRolesFromServiceAccount = (projectId, serviceEmail, roles, token, options={}) => 
	_removeRoles(projectId, serviceEmail, roles, token, objectHelper.merge(options, { serviceAccount: true }))

const removeRolesFromUser = (projectId, userEmail, roles, token, options={}) => 
	_removeRoles(projectId, userEmail, roles, token, objectHelper.merge(options, { serviceAccount: false }))

const _addRoles = (projectId, serviceEmail, roles, token, options={}) => getProjectIAMpolicies(projectId, token, options).then(({ data: policy }) => {
	_validateRequiredParams({ projectId, serviceEmail, roles: roles && roles.length > 0 ? true : null, token })
	_showDebug(`Add roles to service account in Google Cloud Platform's project ${bold(projectId)}.`, options)

	const member = options.serviceAccount ? `serviceAccount:${serviceEmail}` : `user:${serviceEmail}`
	policy = policy || {}
	policy.bindings = policy.bindings || []
	roles.forEach(role => {
		const existingBinding = policy.bindings.find(x => x.role == role)
		if (existingBinding && (!existingBinding.members || !existingBinding.members.some(m => m == member))) {
			existingBinding.members = existingBinding.members || []
			existingBinding.members.push(member)
		} else 
			policy.bindings.push({ role, members: [member] })
	})

	const body = JSON.stringify({ policy }, null, ' ')

	return fetch.post(`${PROJECT_URL(projectId)}:setIamPolicy`, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, body, options)
		.then(res => ({ status: res.status, data: res.data || {} }))
})

const _removeRoles = (projectId, serviceEmail, roles, token, options={}) => getProjectIAMpolicies(projectId, token, options).then(({ data: policy }) => {
	_validateRequiredParams({ projectId, serviceEmail, token })
	_showDebug(`Add roles to service account in Google Cloud Platform's project ${bold(projectId)}.`, options)

	const member = options.serviceAccount ? `serviceAccount:${serviceEmail}` : `user:${serviceEmail}`
	policy = policy || {}
	policy.bindings = policy.bindings || []

	if (!roles)
		policy.bindings.forEach(b => {
			b.members = (b.members || []).filter(m => m != member)
		})
	else
		roles.forEach(role => {
			const existingBinding = policy.bindings.find(x => x.role == role)
			if (existingBinding && existingBinding.members && existingBinding.members.some(m => m == member)) 
				existingBinding.members = (existingBinding.members || []).filter(m => m != member)
		})

	const body = JSON.stringify({ policy }, null, ' ')

	return fetch.post(`${PROJECT_URL(projectId)}:setIamPolicy`, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, body, options)
		.then(res => ({ status: res.status, data: res.data || {} }))
})

const deleteServiceAccount = (projectId, serviceEmail, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, serviceEmail, token })
	_showDebug(`Deleting a service account in Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.delete(IAM_SERVICE_ACCOUNT_URL(projectId, serviceEmail), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null, options)
		.then(res => ({ status: res.status, data: res.data || {} }))
		.catch(e => {
			if (!options.skipEnableApi)
				return _enableIamApiIfError(e, projectId, token, () => deleteServiceAccount(projectId, serviceEmail, token, objectHelper.merge(options, { skipEnableApi: true })), options)
			else 
				throw e
		})
})

const listServiceAccountKeys = (projectId, serviceEmail, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, serviceEmail, token })
	_showDebug(`Listing all keys for a service account in Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(IAM_SERVICE_ACCOUNT_KEY_URL(projectId, serviceEmail), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, objectHelper.merge(options, { verbose: false }))
		.then(res => ({ status: res.status, data: (res.data || {}).keys }))
		.catch(e => {
			if (!options.skipEnableApi)
				return _enableIamApiIfError(e, projectId, token, () => listServiceAccountKeys(projectId, serviceEmail, token, objectHelper.merge(options, { skipEnableApi: true })), options)
			else 
				throw e
		})
})

const generateServiceAccountKey = (projectId, serviceEmail, token, options={}) => getAppDetails(projectId, token, options).then(({ data: { locationId } }) => {
	_validateRequiredParams({ projectId, serviceEmail, token })
	_showDebug(`Generating a new key for a service account in Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.post(IAM_SERVICE_ACCOUNT_KEY_URL(projectId, serviceEmail), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({
		privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE'
	}), objectHelper.merge(options, { verbose: false }))
		.then(res => {
			let jsonKey = JSON.parse(Buffer.from(res.data.privateKeyData, 'base64').toString())
			jsonKey.location_id = locationId
			return { status: res.status, data: jsonKey }
		})
		.catch(e => {
			if (!options.skipEnableApi)
				return _enableIamApiIfError(e, projectId, token, () => generateServiceAccountKey(projectId, serviceEmail, token, objectHelper.merge(options, { skipEnableApi: true })), options)
			else 
				throw e
		})
})

/**
 * [description]
 * @param  {Boolean} 	options.usersOnly 	[description]
 * @return {[String]}         				[description]
 */
const getAllAccountRoles = (options={}) => options.usersOnly 
	? Promise.resolve([
		'roles/viewer',
		'roles/editor',
		'roles/owner'])
	: Promise.resolve([
		'roles/viewer',
		'roles/editor',
		'roles/owner',
		'roles/appengine.appAdmin',
		'roles/appengine.appViewer',
		'roles/appengine.codeViewer',
		'roles/appengine.deployer',
		'roles/appengine.serviceAdmin',
		'roles/bigquery.admin',
		'roles/bigquery.dataEditor',
		'roles/bigquery.dataOwner',
		'roles/bigquery.dataViewer',
		'roles/bigquery.jobUser',
		'roles/bigquery.user',
		'roles/bigtable.admin',
		'roles/bigtable.reader',
		'roles/bigtable.user',
		'roles/bigtable.viewer',
		'roles/billing.admin',
		'roles/billing.creator',
		'roles/billing.projectManager',
		'roles/billing.user',
		'roles/billing.viewer',
		'roles/cloudbuild.builds.editor',
		'roles/cloudbuild.builds.viewer',
		'roles/clouddebugger.agent',
		'roles/clouddebugger.user',
		'roles/cloudiot.admin',
		'roles/cloudiot.deviceController',
		'roles/cloudiot.editor',
		'roles/cloudiot.provisioner',
		'roles/cloudiot.serviceAgent',
		'roles/cloudiot.viewer',
		'roles/cloudkms.admin',
		'roles/cloudkms.cryptoKeyDecrypter',
		'roles/cloudkms.cryptoKeyEncrypter',
		'roles/cloudkms.cryptoKeyEncrypterDecrypter',
		'roles/cloudsql.admin',
		'roles/cloudsql.client',
		'roles/cloudsql.editor',
		'roles/cloudsql.viewer',
		'roles/cloudsupport.admin',
		'roles/cloudsupport.viewer',
		'roles/cloudtrace.admin',
		'roles/cloudtrace.agent',
		'roles/cloudtrace.user',
		'roles/composer.admin',
		'roles/composer.environmentAndStorageObjectAdmin',
		'roles/composer.environmentAndStorageObjectViewer',
		'roles/composer.user',
		'roles/composer.worker',
		'roles/compute.admin',
		'roles/compute.imageUser',
		'roles/compute.instanceAdmin',
		'roles/compute.loadBalancerAdmin',
		'roles/compute.networkAdmin',
		'roles/compute.networkUser',
		'roles/compute.networkViewer',
		'roles/compute.securityAdmin',
		'roles/compute.storageAdmin',
		'roles/compute.viewer',
		'roles/compute.xpnAdmin',
		'roles/container.admin',
		'roles/container.clusterAdmin',
		'roles/container.developer',
		'roles/container.viewer',
		'roles/dataflow.developer',
		'roles/dataflow.viewer',
		'roles/dataflow.worker',
		'roles/dataproc.editor',
		'roles/dataproc.viewer',
		'roles/datastore.importExportAdmin',
		'roles/datastore.indexAdmin',
		'roles/datastore.owner',
		'roles/datastore.user',
		'roles/datastore.viewer',
		'roles/deploymentmanager.editor',
		'roles/deploymentmanager.typeEditor',
		'roles/deploymentmanager.typeViewer',
		'roles/deploymentmanager.viewer',
		'roles/dialogflow.admin',
		'roles/dialogflow.client',
		'roles/dialogflow.reader',
		'roles/dns.admin',
		'roles/dns.reader',
		'roles/endpoints.portalAdmin',
		'roles/errorreporting.admin',
		'roles/errorreporting.user',
		'roles/errorreporting.viewer',
		'roles/errorreporting.writer',
		'roles/iam.organizationRoleAdmin',
		'roles/iam.organizationRoleViewer',
		'roles/iam.roleAdmin',
		'roles/iam.roleViewer',
		'roles/iam.securityReviewer',
		'roles/iam.serviceAccountAdmin',
		'roles/iam.serviceAccountKeyAdmin',
		'roles/iam.serviceAccountTokenCreator',
		'roles/iam.serviceAccountUser',
		'roles/iap.httpsResourceAccessor',
		'roles/logging.admin',
		'roles/logging.configWriter',
		'roles/logging.logWriter',
		'roles/logging.privateLogViewer',
		'roles/logging.viewer',
		'roles/ml.admin',
		'roles/ml.developer',
		'roles/ml.jobOwner',
		'roles/ml.modelOwner',
		'roles/ml.modelUser',
		'roles/ml.operationOwner',
		'roles/ml.viewer',
		'roles/monitoring.admin',
		'roles/monitoring.editor',
		'roles/monitoring.metricWriter',
		'roles/monitoring.viewer',
		'roles/orgpolicy.policyAdmin',
		'roles/pubsub.admin',
		'roles/pubsub.editor',
		'roles/pubsub.publisher',
		'roles/pubsub.subscriber',
		'roles/pubsub.viewer',
		'roles/redis.admin',
		'roles/redis.editor',
		'roles/redis.viewer',
		'roles/resourcemanager.folderAdmin',
		'roles/resourcemanager.folderCreator',
		'roles/resourcemanager.folderEditor',
		'roles/resourcemanager.folderIamAdmin',
		'roles/resourcemanager.folderMover',
		'roles/resourcemanager.folderViewer',
		'roles/resourcemanager.lienModifier',
		'roles/resourcemanager.organizationViewer',
		'roles/resourcemanager.projectCreator',
		'roles/resourcemanager.projectDeleter',
		'roles/resourcemanager.projectIamAdmin',
		'roles/resourcemanager.projectMover',
		'roles/servicemanagement.quotaAdmin',
		'roles/servicemanagement.quotaViewer',
		'roles/servicemanagement.serviceController',
		'roles/source.admin',
		'roles/source.reader',
		'roles/source.writer',
		'roles/spanner.admin',
		'roles/spanner.databaseAdmin',
		'roles/spanner.databaseReader',
		'roles/spanner.databaseUser',
		'roles/spanner.viewer',
		'roles/storage.admin',
		// 'roles/storage.legacyBucketOwner',
		// 'roles/storage.legacyBucketWriter',
		// 'roles/storage.legacyObjectOwner',
		// 'roles/storage.legacyObjectReader',
		'roles/storage.objectAdmin',
		'roles/storage.objectCreator',
		'roles/storage.objectViewer'
	])

const deleteServiceAccountKey = (projectId, serviceEmail, keyId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, serviceEmail, keyId, token })
	_showDebug(`Deleting a service account key in Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.delete(IAM_SERVICE_ACCOUNT_KEY_URL(projectId, serviceEmail, keyId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, null, objectHelper.merge(options, { verbose: false }))
		.then(res => ({ status: res.status, data: res.data || {} }))
		.catch(e => {
			if (!options.skipEnableApi)
				return _enableIamApiIfError(e, projectId, token, () => deleteServiceAccountKey(projectId, serviceEmail, token, objectHelper.merge(options, { skipEnableApi: true })), options)
			else 
				throw e
		})
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - IAM APIS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											START - PRIVATE UTILS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * [description]
 * @param  {[type]}   projectId     [description]
 * @param  {[type]}   operationId   [description]
 * @param  {[type]}   token         [description]
 * @param  {[type]}   onSuccess     [description]
 * @param  {[type]}   onFailure     [description]
 * @param  {Function} options.interval      default: 4000
 * @param  {Function} options.timeOut      	default: 300000
 * @return {[type]}                 [description]
 */
const _checkOperation = (projectId, operationId, token, onSuccess, onFailure, options) => promise.check(
	() => checkOperationStatus(projectId, operationId, token, options).catch(e => {
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

/**
 * [description]
 * @param  {[type]}   projectId     [description]
 * @param  {[type]}   operationId   [description]
 * @param  {[type]}   token         [description]
 * @param  {[type]}   onSuccess     [description]
 * @param  {[type]}   onFailure     [description]
 * @param  {Function} options.interval      default: 4000
 * @param  {Function} options.timeOut      	default: 300000
 * @return {[type]}                 [description]
 */
const _checkServiceAPIOperation = (operationId, token, onSuccess, onFailure, options) => promise.check(
	() => checkServiceOperationStatus(operationId, token, options).catch(e => {
		console.log(error('Unable to check service API operation status.'))
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

const _checkVersionServingStatus = (projectId, service, version, status='SERVING', token, onSuccess, onFailure, options) => promise.check(
	() => {
		return getServiceVersion(projectId, service, version, token, options)
	}, 
	({ data }) => {
		if (data && data.servingStatus == status) {
			if (onSuccess) onSuccess(data)
			return { message: 'done' }
		}
		else if (data && data.code && data.message) {
			if (onFailure) onFailure(data)
			return { error: data }
		} else 
			return false
	}, options)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////
//////											END - PRIVATE UTILS
//////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
	oAuthToken: {
		'get': getOAuthToken,
		refresh: refreshOAuthToken
	},
	consent: {
		request: requestConsent
	},
	project: {
		'get': getProject,
		list: listProjects, 
		create: createProject,
		delete: deleteProject,
		billing: {
			'get': getProjectBillingInfo,
			goToSetupPage: redirectToBillingPage,
			isEnabled: testBillingEnabled,
			enable: setUpProjectBilling
		},
		serviceAccount: {
			list: listServiceAccounts,
			create: createServiceAccount,
			delete: deleteServiceAccount,
			key: {
				generate: generateServiceAccountKey,
				delete: deleteServiceAccountKey
			},
			roles: {
				'get': getAllAccountRoles,
				add: addRolesToServiceAccount,
				delete: removeRolesFromServiceAccount
			}
		},
		user: {
			list: listUsers,
			create: addRolesToUser,
			delete: (projectId, serviceEmail, token, options={}) => removeRolesFromUser(projectId, serviceEmail, null, token, options),
			roles: {
				delete: removeRolesFromUser,
				add: addRolesToUser
			}
		},
		iamPolicies: {
			'get': getProjectIAMpolicies
		}
	},
	bucket: {
		'get': getBucketFileContent,
		list: listBuckets,
		exists: isBucketnameExists,
		getRegions: listBucketLocations,
		getInfo: getBucketFile,
		create: createBucket,
		uploadFile: uploadFileToBucket,
		delete: deleteBucket
	},
	bigQuery: {
		list: listBigQueryDBs,
		table: {
			list: listBigQueryTables
		}
	},
	app: {
		'get': getAppDetails,
		getRegions: getAppRegions,
		getInstanceTypes,
		create: createApp,
		deploy: deployApp,
		getOperationStatus: checkOperationStatus,
		service: {
			'get': getService,
			list: listServices,
			delete: deleteService,
			version: {
				'get': getServiceVersion,
				list: listServiceVersions,
				delete: deleteServiceVersion,
				update: updateServiceVersion,
				minimizeBilling,
				migrateAllTraffic: migrateAllTraffic,
				start: startVersion,
				stop: stopVersion
			}
		},
		domain: {
			'get': getDomain,
			list: listDomains,
			delete: deleteDomain
		},
		cron: {
			'get': getCron,
			update: updateCron
		},
		queue: {
			'get': getQueues,
			update: updateQueue,
			beta: {
				list: listTaskQueues,
				create: createTaskQueue,
				delete: deleteTaskQueue
			}
		}
	},
	serviceAPI: {
		exists: serviceAPIExists,
		list: listServiceAPIs,
		enable: enableServiceAPI,
		disable: disableServiceAPI
	},
	build: {
		'get': getBuild
	},
	_: {
		getFullyQualifiedPropNames
	}
}

