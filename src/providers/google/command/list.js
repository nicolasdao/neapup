/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const path = require('path')
const gcp = require('../gcp')
const utils = require('../utils')
const { bold, gray, wait, error, promptList, warn, info, link } = require('../../../utils/console')
const { collection, obj: { merge }, file } = require('../../../utils')
const projectHelper = require('../project')
const { hosting: hostingHelper } = require('../config')

const listProjectsOrServices = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true }))
	.then(({ token }) => {
		let waitDone = wait('Gathering information about your Google Cloud Account')
		return gcp.project.list(token, options)
			.then(({ data }) => {
				waitDone()
				const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
				const activeProjectIds = activeProjects.map(p => p.projectId)
				const topLevelChoices = [
					{ name: ' 1. List your Google Account App Engine\'s Services', value: 'services' },
					{ name: ' 2. List your Google Account Projects', value: 'projects' },
					{ name: ' 3. Login to another Google Account', value: 'account' }
				]

				options.projectPath = projectHelper.getFullPath(options.projectPath)

				return promptList({ message: (options.question || 'Choose one of the following options:'), choices: topLevelChoices, separator: false }).then(answer => {
					if (!answer)
						process.exit()
					if (answer == 'services') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => _getProjectId(appJsonFiles, activeProjectIds, token, options))
							.then(({ projectId, token }) => _listProjectServices(projectId, token, options))
					else if (answer == 'account')
						return utils.account.choose(merge(options, { skipProjectSelection: true, skipAppEngineCheck: true })).then(() => listProjectsOrServices(options))
					else
						return _listProjectDetails(activeProjectIds, token, options)
				})
			}).catch(e => {
				waitDone()
				console.log(error('Failed to list services', e.message, e.stack))
				throw e
			})
	})
	.then(() => listProjectsOrServices(merge(options, { question: 'What else do you want to do?' })))

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

				const services = _createTable((data || []).map(service => {
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
					}
				}))

				services.forEach(row => console.log(`     ${row}`))
				console.log(gray(`     For more info, go to ${link(`https://console.cloud.google.com/appengine?project=${projectId}`)}`))
				if (services.length > 0)
					console.log('\n')
			})
			_showLegend()
		})
})

const _createTable = rows => {
	if (!rows || !rows.length)
		return []

	const opts = { paddingLeft: 1, paddingRight: 1 }
	const headerOpts = { paddingLeft: 1, paddingRight: 1, format: gray }
	const columns = Object.keys(rows[0]).map(colName => {
		const colWidth = _getMaxColWidth([colName, ...rows.map(v => v[colName])], opts)
		const header = _adjustContentToWidth(colName, colWidth, headerOpts)
		const nonFormattedhHeader = _adjustContentToWidth(colName, colWidth, Object.assign({}, headerOpts, { format: null }))
		const colItems = rows.map(v => _adjustContentToWidth(v[colName], colWidth, opts))
		return { header, nonFormattedhHeader, items: colItems }
	})

	const head = `|${columns.map(x => x.header).join('|')}|`
	const nonFormattedHead = `|${columns.map(x => x.nonFormattedhHeader).join('|')}|`
	const line = collection.seed(nonFormattedHead.length).map(() => '=').join('')
	return [
		head,
		line,
		...rows.map((row, idx) => `|${columns.map(col => (col.items || [])[idx]).join('|')}|`)
	]
}

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

const _getProjectId = (appJsonFiles=[], allowedProjectIds=[], token, options={}) => {
	const getProj = (appJsonFiles && appJsonFiles.length > 0) 
		? Promise.all(appJsonFiles.map(f => _getHostingFromFileName(f, options.projectPath)))
			.then(values => {
				const projectIds = Object.keys((values || []).filter(x => x && x.projectId).reduce((acc,key) => {
					acc[key] = true
					return acc
				}, {}))

				if (projectIds.length == 0)
					return { projectId: null, token }
				else {
					const authorizedProjects = projectIds.filter(id => allowedProjectIds.some(pId => pId == id))
					const fName = appJsonFiles.length == 1 ? `in your ${bold(appJsonFiles[0])}` : `across multiple ${bold('app.<env>.json')}`
					const msg = projectIds.length == 1
						? `We've found a single Google Cloud Project defined ${fName}`
						: `We've found different Google Cloud Projects defined ${fName}`
					console.log(info(msg))
					if (authorizedProjects.length != projectIds.length)
						console.log(warn('You\'re currently logged in to a Google Account which does not have access to all the projects defined in the app.<env>.json files'))
					const authChoices = [
						...authorizedProjects.map(value => ({ name: `List Services for project ${bold(value)}`, value })),
						{ name: 'List Services from another project', value: '[other]' },
						{ name: 'Login to another Google Account', value: 'account' }
					]

					const formattedChoices = authChoices.map((x, idx) => ({
						name: ` ${idx+1}. ${x.name}`,
						value: x.value
					}))

					return promptList({ message: 'Next:', choices: formattedChoices, separator: false }).then(answer => {
						if (!answer)
							return listProjectsOrServices(options)
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
				...allowedProjectIds.map(value => ({ name: `List Services for project ${bold(value)}`, value })),
				{ name: 'Login to another Google Account', value: 'account' }
			]

			const formattedChoices = choices.map((x, idx) => ({
				name: ` ${idx+1}. ${x.name}`,
				value: x.value
			}))

			return promptList({ message: 'Choose one of the following options:', choices: formattedChoices, separator: false }).then(answer => {
				if (!answer)
					return listProjectsOrServices(options)
				else if (answer == 'account')
					return utils.account.choose(merge(options))
				else
					return { projectId: answer, token }
			})
		}
	})
}

const _listProjectServices = (projectId, token, options) => {
	console.log(`Services for project ${bold(projectId)}`)
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
						leaking: v.isLeaking ? 'TRUE' : 'FALSE'
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

module.exports = listProjectsOrServices




