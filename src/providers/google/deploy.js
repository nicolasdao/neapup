/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const { join, dirname, basename } = require('path')
const { file: { getRootDir }, collection } =  require('../../utils')

/**
 * Error Codes:
 * 		- 404: Files not found. Handler scripts are referencing missing files.
 * 		- 501: Missing a server file. The server file is required to start the server and start listening to requests.
 * 		- 502: Ambiguous files. Cannot decide which file should be used to serve traffic.
 * 		- 503: Missing required 'package.json'. A nodejs project must have one.
 
 * @param  {Object} hostingConfig [description]
 * @param  {Array}  projectFiles  [description]
 * @return {[type]}               [description]
 */
const getHandlers = (hostingConfig={}, projectFiles=[]) => {
	if (!projectFiles || projectFiles.lenhth == 0)
		return hostingConfig || {}

	const projectDir = getRootDir(projectFiles)
	const packJsonFile = join(projectDir, 'package.json')

	if (!projectFiles.some(f => f == packJsonFile)) {
		let e = new Error('Missing required \'package.json\'. A nodejs project must have one.')
		e.code = 503
		throw e
	}

	const appJsFile = join(projectDir, 'app.js')
	const serverJsFile = join(projectDir, 'server.js')
	const indexJsFile = join(projectDir, 'index.js')
	const containsAppJs = projectFiles.some(f => f == appJsFile)
	const containsServerJs = projectFiles.some(f => f == serverJsFile)
	const containsIndexJs = projectFiles.some(f => f == indexJsFile)

	const tryToFixMissingScripts = !hostingConfig.handlers || !hostingConfig.handlers.length || hostingConfig.handlers.some(h => !h.script || !h.script.scriptPath)

	// 1. Make sure that all the missing scripts are added
	const updatedHandlers = tryToFixMissingScripts ? (() => {
		if ((containsAppJs && containsServerJs) || (containsAppJs && containsIndexJs) || (containsServerJs && containsIndexJs)) {
			let e = new Error('Ambiguous files. Cannot decide which file should be used to serve traffic.')
			e.code = 502
			const files = []
			if (containsAppJs)
				files.push('app.js')
			if (containsServerJs)
				files.push('server.js')
			if (containsIndexJs)
				files.push('index.js')

			e.handlers = _createHandlerErrors(hostingConfig.handlers, files)

			throw e
		} else if (!containsAppJs && !containsServerJs && !containsIndexJs) {
			let e = new Error('Missing a server file. The server file is required to start the server and start listening to requests.')
			e.code = 501
			e.handlers = _createHandlerErrors(hostingConfig.handlers, _getJsCandidates(projectFiles, projectDir))
			throw e
		} else if (containsAppJs && !containsServerJs && !containsIndexJs)
			return _updateHandlers(hostingConfig.handlers, 'app.js')
		else if (!containsAppJs && containsServerJs && !containsIndexJs)
			return _updateHandlers(hostingConfig.handlers, 'server.js')
		else
			return _updateHandlers(hostingConfig.handlers, 'index.js')
	})() : hostingConfig.handlers  

	// 2. Make sure that all the scripts exist
	const scripts = (updatedHandlers || []).filter(h => h.script && h.script.scriptPath).map(({ urlRegex, script }) => ({ path: join(projectDir, script.scriptPath), script, urlRegex }))
	const missingFiles = scripts.filter(({ path: s }) => !projectFiles.some(f => f == s))
	if (missingFiles.length > 0) {
		let e = new Error('Files not found. Handler scripts are referencing missing files.')
		e.code = 404
		e.handlers = missingFiles
		throw e
	}

	// 3. Make sure the urlRegex is set up
	if (updatedHandlers)
		return updatedHandlers.map(h => {
			h.urlRegex = h.urlRegex || '.*'
			return h
		})
	else 
		return updatedHandlers
}

const _getJsCandidates = (projectFiles, projectDir) => collection.sortBy((projectFiles || []).reduce((acc, f) => {
	const fileName = basename(f) || ''
	const dir = dirname(f) || ''
	const isJsFile = fileName.match(/\.js$/)
	if (dir == projectDir && isJsFile)
		acc.push(fileName)
	return acc
}, []))

const _updateHandlers = (handlers, script) => {
	if (!handlers && script == 'app.js')
		return handlers
	else {
		if ((handlers || []).length == 0)
			return [{ urlRegex: '.*', script: { scriptPath: script } }]
		else 
			return (handlers || []).map(h => {
				h.urlRegex = h.urlRegex || '.*'
				h.script = h.script || { scriptPath: script }
				return h
			})
	}
}

const _createHandlerErrors = (handlers, files) => {
	const emptyScriptHandlers = (handlers || []).filter(({ script }) => !script)
	if (emptyScriptHandlers.length == 0)
		return [{ urlRegex: '.*', files: files || [] }]
	else
		return emptyScriptHandlers.map(h => {
			h.urlRegex = h.urlRegex || '.*'
			h.files = files || []
			return h
		})
}

module.exports = {
	getHandlers
}