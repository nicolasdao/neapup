/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

const path = require('path')
const { error, info, link, promptList, bold, debugInfo, askQuestion, question, wait, success, warn } = require('../../utils/console')
const getToken = require('./getToken')
const authConfig = require('../../utils/authConfig')
const gcp = require('./gcp')
const { identity, promise, obj: { merge } } = require('../../utils')
const apis = require('./api')

const getProjects = (options={ debug:false, show:false }) => getToken({ debug: (options || {}).debug }).then(token => {
	const { debug, show } = options || {}

	if (debug)
		console.log(debugInfo('Retrieving project now...'))

	if (!token) {
		console.log(error('Failed to retrieve projects from Google Cloud Platform. Could not access OAuth token required for safe authentication.'))
		if (options.noExit) { return null } else process.exit()
	}

	return gcp.project.list(token, options).then(({ data }) => {
		const projects = ((data || {}).projects || []).filter(p => p && p.lifecycleState == 'ACTIVE').map(p => ({
			name: `${p.name} (${p.projectId})`,
			value: p.projectId,
			short: p.name				
		}))

		if (debug)
			console.log(debugInfo(`Projects successfully retrieved. Found ${projects.length} projects.`))

		if (show) {
			if (projects.length == 0)
				console.log(info('No projects found in this Google Could Platform account.'))
			else
				projects.forEach(p => {
					console.log(info(p.name))
				})
		}

		return projects
	})
})

const highlightCurrentProjects = (projects=[], currentProjectId) => {
	if (projects.length == 0 || !currentProjectId)
		return projects

	let currentProject = projects.find(p => p.value == currentProjectId)
	if (!currentProject)
		return projects

	currentProject.name = `${bold('[Current]')} ${currentProject.name}`
	return [currentProject, ...projects.filter(p => p.value != currentProjectId)]
}

const selectProject = (options={ debug:false, current: null }) => {
	const listingProjectDone = wait('Loading projects')
	return getProjects(options).then(projects => {
		listingProjectDone()
		const { current } = options || {}
		const createLabel = 'Create new project'
		const choices = [...highlightCurrentProjects(projects, current),{ name: createLabel, value: '[create]', short: createLabel, specialOps: true }]

		const firstProject = ((projects || [])[0] || {}).value
		if (options.skipProjectSelection && firstProject)
			return firstProject
		else
			return promptList({ message: 'Select a project:', choices, separator: false})
				.catch(e => {
					console.log(error(e.message))
					console.log(error(e.stack))
					if (options.noExit) { return null } else process.exit()
				})
	}).catch(e => {
		listingProjectDone()
		throw e
	})
}

const getCurrentProject = () => authConfig.get().then((config={}) => (config.google || {}).project)

const updateCurrentProject = (options={ debug:false }) => authConfig.get(options).then((config={}) => {
	const { debug } = options || {}
	
	if (debug)
		config.google && config.google.project 
			? console.log(debugInfo('Updating current project.')) 
			: console.log(debugInfo('No project was currently set up locally. Setting one up now...'))

	const currentProjectId = options.currentProjectId || (config.google || {}).project
	return selectProject(Object.assign(options, { current: currentProjectId }))
		.then(project => {
			if (!project) {
				if (!options.silentMode)
					console.log(error('Failed to update the current Google Could Platform project.'))
				if (options.noExit) { return null } else process.exit()
			} else if (project == '[create]')
				return getToken(options).then(token => createNewProject(token, options))
			else 
				return project
		})
		.then(projectId => {
			if (debug)
				console.log(debugInfo('New project successfully selected. Saving it locally now...'))

			config.google = Object.assign(config.google || {}, { project: projectId })
			return authConfig.update(config).then(() => config.google)
		})
})

const enterProjectName = () => askQuestion(question('Enter a project name: ')).then(projectName => {
	if (!projectName) {
		console.log(info('The project name is required.'))
		return enterProjectName()
	} else if (projectName.replace(/\s/g,'').length < 5) {
		console.log(info('The project name must contain at least 5 characters excluding spaces.'))
		return enterProjectName()
	} else if (projectName.trim().toLowerCase().match(/^demo(\s|-)/)) {
		console.log(info('The project name cannot start with \'demo \' or \'demo-\'.'))
		return enterProjectName()
	} else 
		return projectName
})

/**
 * [description]
 * @param  {[type]} token   					[description]
 * @param  {Boolean} options.noExit 			[description]
 * @param  {Boolean} options.createAppEngine 	[description]
 * @return {[type]}         					[description]
 */
const createNewProject = (token, options={}) => {
	if (!token) {
		console.log(error('Missing required OAuth \'token\'.'))
		throw new Error('Missing required OAuth \'token\'.')
	}
	// 1. Collect input from user
	return enterProjectName().then(projectName => {
		const projectId = `${projectName.toLowerCase().trim().replace(/\s+/g,'-')}-${identity.new({ short: true })}`.toLowerCase()
		return askQuestion(question(`Are you sure you want to create a new project called ${bold(projectName)} (id: ${bold(projectId)}) (Y/n)? `)).then(answer => {
			if (answer == 'n')
				if (options.noExit) { return null } else process.exit()
			
			if (options.debug)
				console.log(debugInfo(`Creating project ${bold(projectName)} (id: ${bold(projectId)}).`))

			// 2. Create project
			let waitDone = wait(`Creating project ${bold(projectName)} (id: ${bold(projectId)}). This should take a few seconds.\n  If it takes too long, check the status on your account: ${link('https://console.cloud.google.com/cloud-resource-manager?organizationId=0')}`)
			return gcp.project.create(projectName, projectId, token, merge(options, { confirm: true, verbose: false }))
				.then(() => {
					waitDone()
					console.log(success('Project successfully created'))
					return projectId
				})
				// 3. Enable billing
				.then(() => enableBilling(projectId, token, options).then(res => res.projectId))
				// 4. Enable Cloud Task API
				.then(projectId => {
					waitDone = wait('Enabling the Google APIs')
					return apis.enable.all(projectId, token, options).then(() => {
						waitDone()
						return projectId
					})
				})
				.then(projectId => {
					if (!options.createAppEngine)
						return projectId

					return gcp.app.getRegions().then(regions => {
						const choices = regions.map(({ id, label }, idx) => ({
							name: ` ${idx+1}. ${label}`,
							value: id,
							short: id				
						}))
						return promptList({ message: 'Select a region (WARNING: This cannot be undone!):', choices, separator: false})
					})
						.then(answer => {
							if (!answer) 
								return projectId

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
									return projectId
								})
						})
				})
				.catch(e => {
					waitDone()
					const er = JSON.parse(e.message)
					if (er.code == 400 && er.message && er.message.toLowerCase().indexOf('project_id contains invalid components') >= 0) {
						console.log(error('This project name is already taken. Please try another one'))
						return getToken(options).then(token => createNewProject(token, options))
					} else 
						throw e
				})
		})
	})
}

const enableBilling = (projectId, token, options) => {
	console.log(info(`You must enable billing before you can deploy code to ${bold(projectId)}`))
	return askQuestion(question('Do you want to enable billing now (Y/n)?')).then(answer => {
		if (answer == 'n') {
			console.log(warn(`You won't be able to deploy any code until billing is enabled.\nThis is a Google Cloud policy (more info at ${link('https://support.google.com/cloud/answer/6158867')}).\nTo enable billing on project ${bold(projectId)}, browse to ${link(`https://console.cloud.google.com/billing/linkedaccount?project=${projectId}&folder&organizationId`)}.`))
			return { projectId, answer }
		}
		const instructionDone = wait('Redirecting you to your Google Account to enable billing.\n  Come back here when it\'s done')
		return promise.delay(6000)
			.then(() => {
				instructionDone()
				return gcp.project.billing.goToSetupPage(projectId, options)
					.then(billingPage => askQuestion(question(`Great to see you back. Have you enabled billing on project ${bold(projectId)} (Y/n)? `)).then(answer => ({ billingPage, answer })))
			})
			.then(({ billingPage, answer }) => {
				if (answer == 'n') {
					console.log(warn(`Not enabling billing on project ${bold(projectId)} will prevent to deploy any code to its App Engine.`))
					console.log(info(`To enable billing, go to ${link(billingPage)}`))
					return askQuestion(question('Are you sure you want to continue (Y/n)? '))
						.then(a => {
							if (a == 'n')
								if (options.noExit) { return null } else process.exit()
						})
				}
				return answer
			})
			.then(answer => ({ projectId, answer }))
			.catch(e => {
				console.log(error(e.message, e.stack))
				throw e
			})
	})
}

const getProjectPath = projectPath => {
	if (!projectPath)
		return process.cwd()
	else if (projectPath.match(/^\./)) 
		return path.join(process.cwd(), projectPath)
	else if (projectPath.match(/^(\\|\/|~)/)) 
		return projectPath
	else 
		throw new Error(`Invalid path ${projectPath}`)
}

module.exports = {
	getAll: getProjects,
	current: getCurrentProject,
	updateCurrent: updateCurrentProject,
	create: createNewProject,
	enableBilling,
	getFullPath: getProjectPath
}




