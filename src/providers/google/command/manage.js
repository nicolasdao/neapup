/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/
const { success, bold, note, error, info, wait, promptList, link } = require('../../../utils/console')
const utils = require('../utils')
const { obj: { merge }, collection: { sortBy, seed } } = require('../../../utils')
const gcp = require('../gcp')
const getToken = require('../getToken')

const _findService = (service, options={}) => utils.project.confirm(merge({ skipQuestions: true }, options))
	.then(({ token }) => {
		const getServices = options.projectId 
			? _getProjectServices(options.projectId, token, options)
			: _getAllServices(token, options) 

		return getServices
			.then(services => {
				if ((services || []).length == 0) {
					console.log(error('No services found under your Google Cloud account'))
					console.log(info(`Deploy a project to your Google Cloud account first using this command: ${link('neap up')}`))
					process.exit()
				}

				if (!service) {
					const commandHead = options.stop ? 'neap stop' : 'neap start' 
					let choices = sortBy(services.map((s, idx) => {
						const formattedDisplayName = options.projectId 
							? `${s.id}` 
							: `Project ${bold(s.projectId)} - Service ${bold(s.id)}`
						const displayName = options.projectId 
							? `${s.id}` 
							: `Project ${s.projectId} - Service ${s.id}`
						return {
							name: formattedDisplayName,
							value: idx,
							displayName,
							service: s.id,
							projectId: s.projectId
						}
					}), x => x.name)
					const longuestOptions = Math.max(...choices.map(x => x.displayName.length))
					choices = choices.map(c => {
						const missingSpaces = longuestOptions - c.displayName.length
						const gap = seed(missingSpaces).map(() => ' ').join('')
						c.name = `${c.name}${gap}       [${commandHead} ${c.service} -p ${c.projectId}]`
						return c
					})
					return promptList({ message: `Which service do you want to ${options.stop ? 'stop' : 'start'} ?`, choices, separator: false }).then(answer => {
						if (!answer && answer != 0)
							process.exit()

						const v = choices.find(x => x.value == answer)
						service = v.service 
						return services.filter(x => x.projectId == v.projectId)
					})
				} else 
					return services
			})
			.then(services => {
				const svcs = (services || []).filter(({ id }) => id == service)
				if (svcs.length == 0) {
					if (options.projectId) {
						console.log(error(`Service ${bold(service)} not found in project ${bold(options.projectId)}`))
						process.exit()
					} else {
						console.log(error(`Service ${bold(service)} not found in your current Google Cloud account.`))
						process.exit()
					}
				} else if (svcs.length > 1) {
					console.log(info(`Multiple services called ${bold(service)} have been found`))
					const choices = svcs.map(s => ({ name: s.projectId, value: s.projectId }))
					return promptList({ message: 'Which project do you want to choose:', choices, separator: false })
						.then(projectId => {
							if (!projectId)
								process.exit()

							const svc = svcs.find(s => s.projectId == projectId && s.id == service)
							return { projectId, service: svc }
						})
				} else 
					return { projectId: svcs[0].projectId, service: svcs[0] }
			})
	})
	.catch(e => {
		if (e.nextStep)
			return eval(e.nextStep)
		else
			throw e
	})

/**
 * [description]
 * @param  {[type]} projectId [description]
 * @param  {[type]} token     [description]
 * @param  {Boolean} options.noWaitMsg   [description]
 * @return {[type]}           [description]
 */
const _getProjectServices = (projectId, token, options={}) => Promise.resolve(null).then(() => {
	const waitDone = options.noWaitMsg ? () => null : wait(`Getting all services for project ${projectId}...`)
	return gcp.app.service.list(projectId, token, merge(options, { includeVersions: true, verbose: false }))
		.catch(e => {
			try {
				const er = JSON.parse(e.message)
				const errMsg = (er.message || '').toLowerCase()
				if (er && er.code == 404 && errMsg.indexOf('could not find application') >= 0)
					return { data: [] }
				else if (er && er.code == 403 && errMsg.indexOf('operation not allowed') >= 0) {
					waitDone()
					console.log(error(`You don't have access to project ${bold(projectId)}. Choose another Google Account, or contact the ${projectId} admin.`))
					let _e = new Error('Access denied')
					_e.nextStep = '_findService(service, merge(options, { skipQuestions: false, changeAccount: true }))'
					throw _e
				}
				else {
					throw er
				}
			} catch(err) {
				(() => {
					if (err.nextStep)
						throw err 
					else 
						throw e
				})(err)
			}
		})
		.then(({ data: services }) => {
			waitDone()
			return (services || []).map(s => {
				s.projectId = projectId
				return s
			})
		})
		.catch(e => {
			waitDone()
			throw e
		})
})

const _getAllServices = (token, options={}) => Promise.resolve(null).then(() => {
	let waitDone = wait('Getting all projects under your Google Cloud account...')
	return gcp.project.list(token, merge(options, { onlyActive: true }))
		.then(({ data: { projects } }) => {
			waitDone()
			projects = projects || []
			console.log(info(`Found ${projects.length} projects under your Google Cloud account`))
			const opts = merge(options, { noWaitMsg: true })
			waitDone = wait('Getting all services under your Google Cloud account...')
			return Promise.all(projects.map(({ projectId }) => _getProjectServices(projectId, token, opts)))
				.then(values => {
					waitDone()
					return values.reduce((acc, services) => {
						acc.push(...(services || []))
						return acc
					}, [])
				})
		})
		.catch(e => {
			waitDone()
			throw e
		})
})

const _getLegitimateVersion = (version, service) => {
	const legitVersion = ((service || {}).versions || []).find(v => v.id == version)
	if (!legitVersion) {
		console.log(error(`Version ${bold(version)} not found`))
		process.exit()
	}
	return [legitVersion]
}

const _getAllStoppableVersions = (service) => 
	((service || {}).versions || []).filter(v => v.traffic > 0 && v.servingStatus == 'SERVING')

const _getAllStartableVersions = (service) => 
	((service || {}).versions || []).filter(v => v.traffic > 0 && v.servingStatus == 'STOPPED')

const _stopVersions = (projectId, service, versions, options={}) => getToken(options).then(token => {
	const label = versions && (versions.length == 0 || versions.length == 1) ? 'version' : 'versions'
	const waitDone = wait(`Stopping ${versions.length} ${label}...`)
	if (versions && versions.length > 0) {
		return Promise.all(versions.map(v => gcp.app.service.version.stop(projectId, service, v.id, token, merge(options, { confirm: true }))))
			.then(() => {
				waitDone()
				return versions
			})
			.catch(e => {
				waitDone()
				throw e
			})
	}
	else {
		waitDone()
		return versions
	}
})

const _startVersions = (projectId, service, versions, options={}) => getToken(options).then(token => {
	const label = versions && (versions.length == 0 || versions.length == 1) ? 'version' : 'versions'
	const waitDone = wait(`${options.redeploy ? 'Redeploying' : 'Starting'} ${versions.length} ${label}...`)
	if (versions && versions.length > 0) 
		return Promise.all(versions.map(v => gcp.app.service.version.start(projectId, service, v.id, token, merge(options, { confirm: true }))))
			.then(() => {
				waitDone()
				return versions
			})
			.catch(e => {
				console.log('ERROR: ', e.message)
				console.log('ERROR: ', e.stack)
				waitDone()
				throw e
			})
	else {
		waitDone()
		return versions
	}
})

/**
 * [description]
 * @param  {[type]} service 			[description]
 * @param  {Object} options.projectId 	[description]
 * @return {[type]}         			[description]
 */
const _startOrStopService = (service, stop, options={}) => Promise.resolve(null)
	.then(() => {
		let projectId, startTime, verifiedService
		options.stop = stop
		return _findService(service, options)
			.then(({ projectId: id, service }) => {
				verifiedService = service.id
				projectId = id
				if (options.version)
					return _getLegitimateVersion(options.version, service)
				else
					return (stop ? _getAllStoppableVersions : _getAllStartableVersions)(service)
			})
			.then(versions => {
				startTime = Date.now()
				return stop 
					? _stopVersions(projectId, verifiedService, versions, options)
					: _startVersions(projectId, verifiedService, versions, merge(options, { redeploy: true }))
			})
			.then(versions => {
				const label = (versions.length == 0 || versions.length == 1) ? 'version' : 'versions' 
				console.log(success(`Service ${bold(verifiedService)} in project ${bold(projectId)} successfully ${stop ? bold('STOPPED') : bold('SERVING')} in ${((Date.now() - startTime)/1000).toFixed(2)} seconds`))
				console.log(note(`${versions.length} ${label} have been updated`))
			})
	})
	.catch(e => {
		console.log(error(`Failed to ${stop ? 'stop' : 'start'} service ${service}. Details: `))
		console.log(info(e.message))
		console.log(info(e.stack))
		throw e
	})

const startService = (service, options={}) => _startOrStopService(service, false, options)
const stopService = (service, options={}) => _startOrStopService(service, true, options)

module.exports = {
	service: {
		start: startService,
		stop: stopService
	}
}