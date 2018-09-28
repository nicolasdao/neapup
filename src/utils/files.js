/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/
const _fs = require('fs')
const fs = require('fs-extra')
const { join, basename, dirname } = require('path')
const { homedir } = require('os')
const _glob = require('glob')
const archiver = require('archiver')
const { toBuffer } = require('convert-stream')
const { error, exec, debugInfo, cmd, bold, link, info, warn } = require('./console')
const { collection } = require('./core')

const TEMP_FOLDER = join(homedir(), 'temp/neapup')
const FILES_BLACK_LIST = ['.DS_Store', '.git']
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
			const blackList = [...extraFiles, ...FILES_BLACK_LIST]
			const all_files = files.filter(f => !blackList.some(file => basename(f) == file))

			const filesCount = all_files.length + extraFiles.length

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
				return Promise.all(all_files.map(f => fs.copy(f, join(dst, f.replace(src, '')))
					.then(() => null)
					.catch(() => {
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

const zipFolderToBuffer = (src, options={ debug:false }) => fs.exists(src).then(result => {
	if (!result)
		throw new Error(`Failed to zip folder ${src}. This folder does not exist.`)

	const { debug } = options || {}

	if (debug) 
		console.log(debugInfo(`Starting to zip folder \n${src}.`))

	const archive = archiver('zip', { zlib: { level: 9 } })
	const buffer = toBuffer(archive)

	archive.on('warning', err => {
		console.log(error('Warning while creating zip file'), err)
	})

	archive.on('error', err => {
		throw err
	})

	archive.directory(src, '/')
	archive.finalize()
	return buffer
		.then(v => {
			if (debug) 
				console.log(debugInfo(`Folder \n${src} \nsuccessfully zipped to buffer.`))
			return v
		})
		.catch(e => {
			console.log(error(`Failed to zip folder ${src}`))
			throw e
		})
})

const zipNodejsProject = (src, options={ debug:false }) => {
	const { debug } = options || {}

	if (debug) 
		console.log(debugInfo(`Starting to zip nodejs project located under\n${src}`))

	return cloneNodejsProject(src, options)
		.then(({ filesCount, dst }) => zipFolderToBuffer(dst, options).then(buffer => ({ filesCount, buffer, tempFolder: dst })))
		.then(({ filesCount, buffer, tempFolder }) => {
			if (debug) {
				const sizeMb = (buffer.length / 1024 / 1024).toFixed(2) * 1
				const s = sizeMb < 0.01 ? `${(buffer.length / 1024 ).toFixed(2)}KB` : `${sizeMb}MB`
				console.log(debugInfo(`The nodejs project located under\n${src}\nhas been successfully zipped to buffer (${s})`))
			}

			return deleteFolder(tempFolder, options)
				.then(() => ({ filesCount, buffer }))
		})
		.catch(e => {
			console.log(error(`Failed to zip nodejs project located under\n${src}`))
			throw e
		})
}

const fileExists = p => new Promise((onSuccess, onFailure) => _fs.exists(p, exists => exists ? onSuccess(p) : onFailure(p)))

const readFile = filePath => new Promise((onSuccess, onFailure) => _fs.readFile(filePath, 'utf8', (err, data) => err ? onFailure(err) : onSuccess(data)))

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

module.exports = {
	zipToBuffer: zipNodejsProject,
	exists: fileExists,
	write: writeToFile,
	read: readFile,
	getJson,
	getFiles,
	getJsonFiles,
	getAppJsonFiles,
	getRootDir,
	checkStandardEnvFilesQuotas
}



