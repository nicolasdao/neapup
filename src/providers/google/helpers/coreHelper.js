const co = require('co')
const ignore = require('ignore')
const { join } = require('path')
const { error, askQuestion, question } = require('../../../utils/console')
const { file } = require('../../../utils')

const enterName = (q, r, options={}) => askQuestion(question(q)).then(answer => {
	const rx = options.rule || /^[a-zA-Z0-9\-_]+$/
	if (!answer && options.default)
		return options.default
	else if (!answer) {
		console.log(error(r))
		return enterName(q, r, options)
	} else if (answer.match(rx))
		return answer.toLowerCase()
	else {
		console.log(error('Invalid name. A valid name can only contain alphanumerical characters, - and _. Spaces are not allowed.'))
		return enterName(q, r, options)
	}
})

const BLACK_LISTED_DEPLOY_FILES = ['.gitignore','.neapignore','.npmignore']
const _filterDeployFilesOnly = (projectPath, files) => co(function *(){
	files = files || []
	const neapIgnoreContent = (yield file.read(join(projectPath || '', '.neapignore')).catch(() => null))
	const ignoreList = neapIgnoreContent ? neapIgnoreContent.split('\n').map(x => x.trim()) : BLACK_LISTED_DEPLOY_FILES
	BLACK_LISTED_DEPLOY_FILES.forEach(i => {
		if (!ignoreList.some(x => x == i))
			ignoreList.push(i)
	})
	const igFilter = ignore().add(ignoreList).createFilter()
	const cleanedProjectPath = projectPath 
		? process.platform == 'win32' 
			? /\\\\$/.test(projectPath) ? projectPath : `${projectPath}\\` 
			: /\/$/.test(projectPath) ? projectPath : `${projectPath}/`
		: ''
	const filteredFiles = files.filter(f => f && igFilter(f.replace(cleanedProjectPath, ''))) 
	return filteredFiles
})

/**
 * Returns files located under 'projectPath'
 * 
 * @param {String}   projectPath 			Absolute path to the folder containing files
 * @param {Boolean}  options.deployOnly 	Default false. If true and if a .neapignore file exists in the root folder located at 'projectPath', then
 *                                       	files are filtered based on the ignore list in the .neapignore
 *
 * @yield {[String]} output 				List of absolute path to all the files.
 */
const getFiles = (projectPath, options) => co(function *(){
	options = options || {}
	const { deployOnly } = options
	const files = (yield file.getFiles(projectPath, { pattern:'**/*.*' })) || []
	if (deployOnly)
		return yield _filterDeployFilesOnly(projectPath,files)
	else
		return files
})

const getAbsolutePath = somePath => {
	if (!somePath)
		return process.cwd()
	else if (somePath.match(/^\./)) 
		return join(process.cwd(), somePath)
	else if (somePath.match(/^(\\|\/|~)/)) 
		return somePath
	else 
		throw new Error(`Invalid path ${somePath}`)
}

module.exports = {
	enterName,
	getFiles,
	getAbsolutePath
}