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

const _filterDeployFilesOnly = (projectPath, files) => co(function *(){
	files = files || []
	const neapIgnoreContent = yield file.read(join(projectPath || '', '.neapignore')).catch(() => null)
	if (neapIgnoreContent) {	
		const ignoreList = neapIgnoreContent.split('\n').map(x => x.trim())
		const igFilter = ignore().add(ignoreList).createFilter()
		const cleanedProjectPath = projectPath 
			? process.platform == 'win32' 
				? /\\\\$/.test(projectPath) ? projectPath : `${projectPath}\\` 
				: /\/$/.test(projectPath) ? projectPath : `${projectPath}/`
			: ''
		const filteredFiles = files.filter(f => f && igFilter(f.replace(cleanedProjectPath, ''))) 
		return filteredFiles
	} else
		return files
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

module.exports = {
	enterName,
	getFiles
}