/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

// For more info about Google Cloud API, go to https://cloud.google.com/apis/docs/overview

const opn = require('opn')
const { encode: encodeQuery, stringify: formUrlEncode } = require('querystring')
const fetch = require('../../utils/fetch')
const { info, highlight, cmd, link, debugInfo, bold, error } = require('../../utils/console')
const { promise, identity, collection, obj: objectHelper } = require('../../utils/index')

// OAUTH
const OAUTH_TOKEN_URL = () => 'https://www.googleapis.com/oauth2/v4/token'
const GCP_CONSENT_PAGE = query => `https://accounts.google.com/o/oauth2/v2/auth?${query}`
// RESOURCE MANAGER
const PROJECTS_URL = (projectId) => `https://cloudresourcemanager.googleapis.com/v1/projects${projectId ? `/${projectId}` : ''}`
// BILLING
const BILLING_PAGE = projectId => `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}&folder&organizationId`
const BILLING_INFO_URL = projectId => `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`
// BUCKET
const CREATE_BUCKET_URL = projectId => `https://www.googleapis.com/storage/v1/b?project=${projectId}`
const UPLOAD_TO_BUCKET_URL = (bucketName, fileName, projectId) => `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(fileName)}&project=${encodeURIComponent(projectId)}`
// APP ENGINE
const APP_DETAILS_URL = projectId => `https://appengine.googleapis.com/v1/apps/${projectId}`
const CREATE_APP_URL = () => 'https://appengine.googleapis.com/v1/apps'
const APP_SERVICE_URL = (projectId, service) => `https://appengine.googleapis.com/v1/apps/${projectId}/services${service ? `/${service}` : ''}`
const APP_SERVICE_VERSION_URL = (projectId, service, version) => `${APP_SERVICE_URL(projectId, service)}/versions${version ? `/${version}` : ''}`
const DEPLOY_APP_URL = (projectId, service='default') => APP_SERVICE_VERSION_URL(projectId, service)
const OPS_STATUS_URL = (projectId, operationId) => `https://appengine.googleapis.com/v1/apps/${projectId}/operations/${operationId}`
const MIGRATE_ALL_TRAFFIC = (projectId, service='default') => `https://appengine.googleapis.com/v1/apps/${projectId}/services/${service}/?updateMask=split`
const DOMAINS_URL = (projectId) => `https://appengine.googleapis.com/v1/apps/${projectId}/domainMappings`
// SERVICE MGMT
const SERVICE_MGMT_URL = (serviceName, enable) => `https://servicemanagement.googleapis.com/v1/services/${serviceName ? `${serviceName}${enable || ''}`: ''}`
const SERVICE_MGMT_OPS_URL = (opsId) => `https://servicemanagement.googleapis.com/v1/operations/${opsId}`
// CLOUD BUILDS
const BUILD_URL = (projectId, buildId) => `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${buildId}`

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

const requestConsent = ({ client_id, redirect_uri, scope }, stopFn, timeout, options={ debug:false }) => Promise.resolve(null).then(() => {
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
const testBillingEnabled = (projectId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
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

const getProject = (projectId, token, options={ debug:false, verbose:false }) => Promise.resolve(null).then(() => {
	const opts = Object.assign({ debug:false, verbose:false }, options)
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting a project ${bold(projectId)} from Google Cloud Platform.`, opts)

	return fetch.get(PROJECTS_URL(projectId), {
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

	return fetch.get(`${PROJECTS_URL()}?pageSize=2000`, {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	})
		.then(res => {
			if (res && res.data && res.data.projects && options.onlyActive)
				res.data.projects = res.data.projects.filter(p => p && p.lifecycleState == 'ACTIVE')
			return res
		})
})

const createProject = (name, projectId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ name, projectId, token })
	_showDebug(`Creating a new project on Google Cloud Platform called ${bold(name)} (id: ${bold(projectId)}).`, options)

	return fetch.post(PROJECTS_URL(), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({
		name,
		projectId
	})).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	})
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

const createBucket = (name, projectId, token, options={ debug:false, verbose:true }) => Promise.resolve(null).then(() => {
	const opts = Object.assign({ debug:false, verbose:true }, options)
	_validateRequiredParams({ name, token })
	_showDebug(`Creating a new bucket called ${bold(name)} in Google Cloud Platform's project ${bold(projectId)}.`, opts)

	return fetch.post(CREATE_BUCKET_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({ name }), opts)
		.then(res => {
			if (res && res.status == 409)
				_showDebug(`Bucket ${bold(name)} already exists.`, opts)
			return res
		})
})

const uploadZipFileToBucket = (zip, bucket, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	const { name: zipName, file: zipFile  } = zip || {}
	const { name: bucketName, projectId } = bucket || {}
	_validateRequiredParams({ zipName, zipFile, bucketName, projectId, token })
	_showDebug(`Uploading a new zip file to Google Cloud Platform's project ${bold(bucket.projectId)} in bucket ${bold(bucket.name)}.`, options)

	return fetch.post(UPLOAD_TO_BUCKET_URL(bucket.name, zip.name, bucket.projectId), {
		'Content-Type': 'application/zip',
		'Content-Length': zip.file.length,
		Authorization: `Bearer ${token}`
	}, zip.file)
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
/// 1. MAIN -  START
///////////////////////////////////////////////////////////////////
const getAppDetails = (projectId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Getting the ${bold(projectId)}'s App Engine details from Google Cloud Platform.`, options)

	return fetch.get(APP_DETAILS_URL(projectId), {
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
	{ id: 'southamerica-east1', label: 'southamerica-east1 (São Paulo) *' },
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

	return fetch.post(CREATE_APP_URL(), {
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

	return fetch.post(DEPLOY_APP_URL(projectId, service), {
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

	return fetch.get(OPS_STATUS_URL(projectId, operationId), {
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
/// 1. MAIN -  END
///////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////
/// 2. SERVICES -  START
///////////////////////////////////////////////////////////////////

// 2.1. MAIN - START
const getService = (projectId, service, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, token })
	_showDebug(`Requesting service ${bold(service)} for Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	return fetch.get(APP_SERVICE_URL(projectId, service), {
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

	return fetch.get(APP_SERVICE_URL(projectId), {
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
			return { status, data: services }
		})
})
// 2.2. MAIN - END

// 2.1. VERSIONS - START
const getServiceVersion = (projectId, service, version, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, version, token })
	_showDebug(`Requesting version ${bold(version)} from service ${bold(service)} for Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	const uri = `${APP_SERVICE_VERSION_URL(projectId, service, version)}${options.fullView ? '?view=FULL' : ''}`
	return fetch.get(uri, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	})
})

const listServiceVersions = (projectId, service, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ service, projectId, token })
	_showDebug(`Requesting list of all version for service ${bold(service)} Google Cloud Platform's App Engine ${bold(projectId)}.`, options)

	return fetch.get(APP_SERVICE_VERSION_URL(projectId, service) + '?pageSize=2000', {
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

	const url = `${APP_SERVICE_VERSION_URL(projectId, service, version)}?${_createUpdateMaskQuery(patch)}`
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

	return fetch.delete(APP_SERVICE_VERSION_URL(projectId, service, version), {
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

	return fetch.patch(MIGRATE_ALL_TRAFFIC(projectId, service), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, JSON.stringify({ split: { allocations } })).then(res => {
		if (res.data && res.data.name)
			res.data.operationId = res.data.name.split('/').slice(-1)[0]
		return res
	})
})
// 2.1. VERSIONS - END


///////////////////////////////////////////////////////////////////
/// 2. SERVICES -  END
///////////////////////////////////////////////////////////////////

const listDomains = (projectId, token, options={ debug:false }) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	_showDebug(`Requesting all the domains for Google Cloud Platform's project ${bold(projectId)}.`, options)

	return fetch.get(DOMAINS_URL(projectId), {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	})
})

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
		billing: {
			'get': getProjectBillingInfo,
			goToSetupPage: redirectToBillingPage,
			isEnabled: testBillingEnabled,
			enable: setUpProjectBilling
		}
	},
	bucket: {
		create: createBucket,
		uploadZip: uploadZipFileToBucket
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
			list: listDomains
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

