/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

const co = require('co')
const _fs = require('fs')
const fs = require('fs-extra')
const { join, basename, dirname, sep } = require('path')
const { homedir } = require('os')
const _glob = require('glob')
const archiver = require('archiver')
const tar = require('tar-stream')
const { toBuffer } = require('convert-stream')
const { Writable } = require('stream')
const sha1 = require('sha1')
const mime = require('mime-types')
const { error, exec, debugInfo, cmd, bold, link, info, warn } = require('./console')
const { collection } = require('./core')

const TEMP_FOLDER = join(homedir(), 'temp/neapup')
const FILES_BLACK_LIST = ['.DS_Store', '.git', '.npmignore', '.gitignore', '.eslintrc.json']
const FILES_REQUIRED_LIST = ['package.json']
const MAX_FILE_COUNT_PER_STANDARD_PROJECT = 10000
const MAX_FILE_COUNT_PER_STANDARD_PROJECT_FOLDER = 1000


const createTempFolder = () => fs.ensureDir(TEMP_FOLDER)
	.catch(() => {
		console.log(error(`Failed to create temporary folder ${TEMP_FOLDER}.`))
	})

const glob = (pattern, options) => new Promise((success, failure) => _glob(pattern, options, (err, files) => {
	if (err)
		failure(err)
	else
		success(files)
}))

const getFiles = (src='', options={}) => {
	if (options.debug)
		console.log(debugInfo(`Getting all files under ${src}`))

	const pattern = options.pattern || '*.*'
	const opts = options.ignore ? { ignore: options.ignore } : null
	return glob(join(src, pattern), opts)
}

const getJsonFiles = (src='', options={}) => {
	if (options.debug)
		console.log(debugInfo(`Getting all files under ${src}`))

	return glob(join(src, '*.json'))
}

const _getAllNodeJsFiles = (src, options={}) => {
	const ignore = !options.ignoreNodeModules ? null : { ignore: '**/node_modules/**' }
	return glob(join(src, '**/*.*'), ignore)
		.then(files => glob(join(src, '**/.*'), ignore)
			.then(dot_files => ([...(files || []), ...(dot_files || [])])))
}

const _countFilesPerFolders = (files) => {
	const breakDown = (files || []).reduce((acc,f) => {
		const d = dirname(f)
		acc[d] = (acc[d] || 0) + 1
		return acc
	}, {})

	return Object.keys(breakDown).map(folder => ({ folder, files: breakDown[folder] }))
}

// ref: https://cloud.google.com/appengine/docs/standard/nodejs/how-requests-are-handled
const checkStandardEnvFilesQuotas = src => fileExists(join(src, 'node_modules')).catch(() => null).then(yes => {
	if (yes) 
		return _getAllNodeJsFiles(src).then(files => {
			const totalFiles = files.length 
			if (totalFiles > MAX_FILE_COUNT_PER_STANDARD_PROJECT)
				throw new Error(`Your project exceeds the ${MAX_FILE_COUNT_PER_STANDARD_PROJECT} files limit for Standard App Engine environments (current number: ${totalFiles}). Please consider using a Flexible environment instead.`)
			const breakDown = _countFilesPerFolders(files)
			const foldersExceedingLimit = breakDown.filter(x => x.files > MAX_FILE_COUNT_PER_STANDARD_PROJECT_FOLDER)
			if (foldersExceedingLimit.length > 0) {
				let e = new Error(`Your project exceeds the ${MAX_FILE_COUNT_PER_STANDARD_PROJECT_FOLDER} files per folder limit for Standard App Engine environments. Please consider using a Flexible environment instead.`)
				e.folders = foldersExceedingLimit
				throw e
			}
		})
})

const _copyFileOrDirToDest = (file_or_dir_abs_path, dst, src) => co(function *(){
	const new_loc = join(dst, file_or_dir_abs_path.replace(src, ''))
	const new_loc_exists = yield fs.exists(new_loc).catch(() => false)
	if (new_loc_exists)
		return 

	const stat = yield fs.lstat(file_or_dir_abs_path)
	if (stat.isDirectory())
		yield fs.ensureDir(new_loc)
	else
		yield fs.copy(file_or_dir_abs_path, new_loc)
})

/**
 * Clones a folder under a hardcoded temp folder (TEMP_FOLDER + date stamp)
 * 
 * @param  {String}  src				Folder's absolute path to be cloned under the temporary folder.
 * @param  {Boolean} options.debug	
 * 
 * @return {Number}  output.filesCount	
 * @return {String}  output.dst			Destination of the temp folder	
 */
const cloneNodejsProject = (src='', options={}) => createTempFolder().then(() => {
	const { debug } = options || {}
	const dst = join(TEMP_FOLDER, Date.now().toString())
	const includeNodeModules = options.build && options.build.include && options.build.include.node_modules

	if (debug) 
		console.log(debugInfo(`Copying content of folder \n${src} \nto temporary location \n${dst}`))

	// 1. Getting all the files under the "src" folder
	return _getAllNodeJsFiles(src, { ignoreNodeModules: true })
		.then(files => {
			const extraFiles = (options.files || []).filter(x => x && x.name && x.content)
			const extraFullPathFiles = extraFiles.map(x => ({ name: join(dst, x.name), content: x.content }))
			const blackList = [...extraFiles.map(x => join(src, x.name)), ...FILES_BLACK_LIST.map(x => join(src, x))]
			// remove files from the black list as well, the extra files, and the app.env.json
			const all_files = files.filter(f => {
				const relPath = f.replace(src, '').replace(/^(\\|\/)/, '')
				const notAppEnvJson = !relPath.match(/^app\.([a-zA-Z0-9\-_]*?)\.json$/)
				const notInBlackList = !blackList.some(file => f == file) && f.indexOf('.DS_Store') < 0
				return notAppEnvJson && notInBlackList
			})
			
			const filesCount = all_files.length + extraFullPathFiles.map(x => x.name).length

			// 2. Making sure all the required files are defined
			const missingFiles = FILES_REQUIRED_LIST.filter(file => !all_files.some(f => basename(f) == file))
			if (missingFiles.length > 0) {
				console.log(error(`Invalid nodejs project. To deploy the project located under ${link(src)} to Google App Engine, you need to add the following missing files: ${missingFiles.map(x => bold(x)).join(', ')}`))
				throw new Error('Invalid nodejs project.')
			}

			// 3. Making sure that the package.json contains a "start" script
			const packFile = collection.sortBy(all_files.filter(x => basename(x) == 'package.json').map(x => ({ file: x, l: x.length })), x => x.l)[0].file
			return getJson(packFile).then(pack => {
				const missingStartScript = !((pack || {}).scripts || {}).start
				if (missingStartScript) {
					console.log(error(`The ${bold('package.json')} is missing a required ${bold('start')} script.`))
					console.log(info('App Engine requires that start script to start the server (e.g., "start": "node app.js")'))
					throw new Error('Missing required start script in package.json')
				}
		
				if (debug)
					console.log(debugInfo(`Found ${all_files.length} files under folder \n${src}\nCopying them now...`))

				// 4. Copy all the files from "src" to the temp destination
				return Promise.all(all_files.map(f => _copyFileOrDirToDest(f, dst, src)
					.then(() => null)
					.catch(() => {
						console.log(all_files.map(f => join(dst, f.replace(src, ''))))
						console.log(error(`Failed to clone nodejs project located under \n${src}\nto the temporary location \n${dst}\nThis procedure is usually required to zip the project before uploading it to the selected provider.`))
						return f
					})))
					.then(values => Promise.all(extraFullPathFiles.map(f => writeToFile(f.name, f.content)
						.then(() => null)
						.catch(() => {
							console.log(error(`Failed to add extra file to project located under \n${src}\nto the temporary location \n${dst}\nThis procedure is usually required to zip the project before uploading it to the selected provider.`))
							return f
						}))).then(otherValues => [...values, ...otherValues]))
					.then(values => {
						const errors = values.filter(v => v != null)
						if (errors.length > 0) {
							console.log(error(`Could not copy the following files to ${TEMP_FOLDER}:`))
							errors.forEach(err => console.log(error(err)))
							throw new Error('Failed to copy some files.')
						}
					})
					.then(() => {
						if (includeNodeModules) {
						// 1. Create the node_modules dir
							const npmCommand = `npm install --prefix="${dst}/" --production`
							if (debug)
								console.log(debugInfo(`Files successfully copied to \n${dst}${includeNodeModules ? `\nExecuting command ${cmd(npmCommand)}` : ''}`))
							return exec(npmCommand)
								.catch(e => {
									console.log(error(`Command ${cmd(npmCommand)} failed.`))
									console.log(warn(bold('Check that your current nodejs version is adequate to build this project.')))
									console.log(info(`Yours is currently: ${bold(process.version)}`))
									console.log(info('Failing to build a nodejs project is often related to using the wrong nodejs version, especially when webpack is involved.'))
									if (e && e.message)
										throw e 
									else 
										throw new Error(`Command ${npmCommand} failed.`)
								})
								.then(() => {
									if (debug)
										console.log(debugInfo('Command successfully executed.'))
								
									// 2. Renaming the node_modules so it can't be deleted by App Engine
									return fs.move(join(dst, 'node_modules'), join(dst, 'node_modules2'))
								})
								.then(() => {
									if (debug)
										console.log(debugInfo('node_modules successfully renamed node_modules2.'))

									//3. Update the package.json to install nothing (i.e., not install anything)
									//   and add a postinstall script to restore node_modules2
									const tmpPackPath = join(dst, 'package.json')
									return getJson(tmpPackPath).then(pack => {
										pack.dependencies = {}
										pack.devDependencies = {}
										pack.postinstall = 'rm -rf ./node_module && mv ./node_modules2 ./node_module'
										return writeToFile(tmpPackPath, JSON.stringify(pack, null, '  '))
									})
								}) // 4. Get the new file count
								.then(() => _getAllNodeJsFiles(join(dst, 'node_modules2')).then(files => {
									return { filesCount: filesCount + files.length, dst }
								}))
						} else 
							return { filesCount, dst }

					})
			})
		})
})

const deleteFolder = (src, options={ debug:false }) => {
	const { debug } = options || {}
	
	if (debug)
		console.log(debugInfo(`Deleting folder ${src}`))

	return fs.exists(src).then(result => {
		if (result)
			return fs.remove(src)
		else
			return null
	}).then(() => {
		if (debug)
			console.log(debugInfo(`Folder \n${src} \nsuccessfully deleted.`))
		return null
	}).catch(e => {
		if (debug) {
			console.log(debugInfo(`Folder \n${src} \ncould not be deleted.`))
		}
		return e
	})
}


/**
 * Zips a folder into a buffer using zip (default) or tar.
 * 
 * @param  {String}  src			Folder's absolute path on local machine.
 * @param  {String} options.type	Default 'zip'. Valid values are: 'zip', 'tar'
 * @return {Buffer}						
 */
const zipFolderToBuffer = (src, options) => co(function *(){
	const result = yield fs.exists(src)	

	if (!result)
		throw new Error(`Failed to zip folder ${src}. This folder does not exist.`)

	const { type='zip' } = options || {}

	if (type == 'zip') {
		const archive = archiver('zip', { zlib: { level: 6 } })
		const getBuffer = toBuffer(archive)

		archive.on('warning', err => {
			console.log(error('Warning while creating zip file'), err)
		})

		archive.on('error', err => {
			throw err
		})

		archive.directory(src, '/')
		archive.finalize()

		const buffer = yield getBuffer
		
		return buffer
	} else if (type == 'tar') {
		const files = yield getFiles(src, { pattern:'**/*.*' })
		const data = yield files.map(file => readFile(file, { encoding:null }).then(content => ({
			file,
			relFile: file.replace(src,''),
			content
		})))

		const pack = tar.pack()
		data.forEach(({ relFile, content }) => pack.entry({ name:relFile }, content))
		const chunks = []
		const writeStream = new Writable({
			write(chunk, encoding, callback) {
				chunks.push(chunk)
				callback()
			}
		})

		pack.pipe(writeStream)
		pack.finalize()

		yield new Promise((success) => pack.on('end', success))

		const buffer = Buffer.concat(chunks)

		return buffer
	} else 
		throw new Error(`Unsupported zip type ${type}. Valid zip types: 'zip', 'tar'`)
}).catch(e => {
	console.log(error(`Failed to zip folder ${src}`))
	throw e
})

/**
 * Get's the folder's manifest, i.e., the description of all files under that 
 * 
 * @param {String} 	src										Folder's absolute path on local machine.
 * 
 * @yield {String}	manifest['src/repos/index.js'].sha1		sha1 for that file, e.g., '77a06f1aeac07d34bfaa84c408791837cdeab3b9'
 * @yield {String}	manifest['src/repos/index.js'].sha1Sum	e.g., '77a06f1a_eac07d34_bfaa84c4_08791837_cdeab3b9'
 * @yield {Buffer}	manifest['src/repos/index.js'].content	File's content
 */
const getManifest = src => co(function *(){
	const result = yield fs.exists(src)
	if (!result)
		throw new Error(`Failed to zip folder ${src}. This folder does not exist.`)

	let files = yield getFiles(src, { pattern:'**/*.*', ignore:'**/node_modules/**' })
	const dotFiles = yield getFiles(src, { pattern:'**/.*', ignore:'**/node_modules/**' })
	if (dotFiles && dotFiles[0])
		files.push(...dotFiles)
	const data = (yield files.map(file => readFile(file, { encoding:null }).then(content => {
		const id = sha1(content)
		const sha1Sum = id//[0,1,2,3,4].map(i => id.slice(i*8,(i+1)*8)).join('_')
		const name = file.replace(src,'').split(sep).filter(x => x).join('/')
		return {
			id,
			name,
			sha1Sum,
			content
		}
	}))) || []

	return data.reduce((manifest, { id, name, sha1Sum, content }) => {
		manifest[name] = {
			sha1: id,
			sha1Sum,
			content
		}
		return manifest
	}, {})

}).catch(e => {
	console.log(error(`Failed to zip folder ${src}`))
	throw e
})


//getManifest('/Users/nicolasdao/fairplay/fairplay-api/test').then(console.log)

/**
 * Zips the source folder into a buffer.
 * 
 * @param  {String} 			src					
 * @param  {Boolean} 			options.debug		
 * @param  {String} 			options.type		Default 'manifest'. Valid values: 'zip', 'manifest'
 * 
 * @return {Number} 			output.filesCount	
 * @return {Buffer|Manifest} 	output.buffer		
 */
const getNodeJsProjectContent = (src, options) => co(function *(){
	const { debug, type='manifest' } = options || {}

	if (debug) 
		console.log(debugInfo(`Starting to zip nodejs project located under\n${src}`))

	// Copy the source folder in a temp folder.
	const { filesCount, dst:tempFolder } = yield cloneNodejsProject(src, options)

	if (type == 'manifest') {
		const manifest = yield getManifest(tempFolder)
		yield deleteFolder(tempFolder, options)
		return { filesCount, manifest }
	} else {
		// Zip the temp folder
		const buffer = yield zipFolderToBuffer(tempFolder, options)

		if (debug) {
			const sizeMb = (buffer.length / 1024 / 1024).toFixed(2) * 1
			const s = sizeMb < 0.01 ? `${(buffer.length / 1024 ).toFixed(2)}KB` : `${sizeMb}MB`
			console.log(debugInfo(`The nodejs project located under\n${src}\nhas been successfully zipped to buffer (${s})`))
		}
		
		// Delete temp folder
		yield deleteFolder(tempFolder, options)

		return { filesCount, buffer }
	}

}).catch(e => {
	console.log(error(`Failed to zip nodejs project located under\n${src}`))
	throw e
})

const fileExists = p => new Promise((onSuccess, onFailure) => _fs.exists(p, exists => exists ? onSuccess(p) : onFailure(p)))

const readFile = (filePath, options) => new Promise((onSuccess, onFailure) => {
	const { encoding } = options || {}
	if (encoding === undefined)
		_fs.readFile(filePath, 'utf8', (err, data) => err ? onFailure(err) : onSuccess(data))
	else if (encoding === null)
		_fs.readFile(filePath, (err, data) => err ? onFailure(err) : onSuccess(data))
	else
		_fs.readFile(filePath, encoding, (err, data) => err ? onFailure(err) : onSuccess(data))
})

const writeToFile = (filePath, stringContent) => new Promise((onSuccess, onFailure) => _fs.writeFile(filePath, stringContent, err => 
	err ? onFailure(err) : onSuccess()))

const getJson = (filePath) => readFile(filePath)
	.catch(() => null)
	.then(content => {
		try {
			return content ? JSON.parse(content) : {}
		} catch(e) {
			console.log(error(`Invalid json format in file ${filePath}.`))
			throw e
		}
	})

const getAppJsonFiles = (filePath, options) => getJsonFiles(filePath, options)
	.catch(() => [])
	.then(jsonFiles => {
		const appJsonFiles = jsonFiles
			.map(x => basename(x))
			.filter(x => x.match(/^app\./) && (x.split('.').length == 3 || x.split('.').length == 2))
		return collection.sortBy(appJsonFiles, (x => x == 'app.json' ? '0' : x) , 'asc')
	})

const getRootDir = (files=[]) => {
	const nonEmpty = (files || []).filter(f => f)
	const firstDir = dirname(nonEmpty[0] || '')
	
	return nonEmpty.reduce((rootDir, f) => {
		const currentDir = dirname(f)
		const currentDirLength = currentDir.length
		if (rootDir.l <= currentDirLength && currentDir.indexOf(rootDir.dir) < 0) // the root is the root system
			return { dir: '', l:0 }
		else if (rootDir.l > currentDirLength && rootDir.dir.indexOf(currentDir) >= 0) // the root is the new dir
			return { dir: currentDir, l: currentDirLength }
		else // the dir is the previous one
			return rootDir
	}, { dir: firstDir, l: firstDir.length }).dir
}

/**
 * Gets the mime type associated with a file extension. 
 *
 * @param {String}		fileOrExt	e.g., 'json', '.md', 'file.html', 'folder/file.js', 'data:image/png;base64,....'
 * @return {String}					e.g., 'application/json', 'text/markdown', 'text/html', 'application/javascript'
 */
const getMimeType = fileOrExt => {
	if (!fileOrExt)
		return ''
	
	// Test if 'fileOrExt' is a data URI
	if (/^data:(.*?),/.test(fileOrExt)) 
		return (fileOrExt.match(/^data:(.*?);/, '') || [])[1] || ''
	
	return mime.lookup(fileOrExt) || ''
}

// zipFolderToBuffer(join(__dirname, '../providers')).then(buffer => writeToFile(join(__dirname, '../../testtest.tar')))

module.exports = {
	zipToBuffer: (src, options) => getNodeJsProjectContent(src, { ...(options || {}), type:'zip' }),
	getManifest: (src, options) => getNodeJsProjectContent(src, { ...(options || {}), type:'manifest' }),
	exists: fileExists,
	write: writeToFile,
	read: readFile,
	getJson,
	getFiles,
	getJsonFiles,
	getAppJsonFiles,
	getRootDir,
	checkStandardEnvFilesQuotas,
	getMimeType
}



