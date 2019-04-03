const co = require('co')
const { throttle } = require('core-async')
const { client } = require('google-cloud-bucket')
const gcp = require('../gcp')
const { bold, wait, error, promptList, warn, success } = require('../../../utils/console')
const { identity } = require('../../../utils')
const { enterName } = require('./coreHelper')

const chooseName = () => co(function *() {
	const bucketName = yield enterName('Enter a bucket name: ', 'The bucket name is required', { rule: /^[a-zA-Z0-9\-_.]+$/ })
	let waitDone = wait('Checking name uniqueness')
	const [yes, uniqueName] = yield [gcp.bucket.exists(bucketName), findUniqueName(bucketName)]
	waitDone()
	if (yes) {
		console.log(error(`Sorry, but bucket name ${bold(bucketName)} is already taken`))
		const choices = [
			{ name: ` 1. Use ${bold(uniqueName)} instead`, value: 1 },
			{ name: ' 2. Choose another bucket name', value: 2 }
		]
		const optionId = yield promptList({ message: 'Choose one of the following options:', choices, separator: false, noAbort: true })
		if (optionId == 1)
			return uniqueName
		else 
			return chooseName()
	} else
		return bucketName
})

const findUniqueName = (name='') => {
	const newName = `${name}-${identity.new({ short: true })}`.toLowerCase()
	return gcp.bucket.exists(newName).then(yes => yes ? findUniqueName(name) : newName)
}

const chooseLocation = () => co(function *(){
	const choices = [
		{ name: ' 1. Single region (cheaper)', value: 'singleRegions' }, 
		{ name: ' 2. Multi regions', value: 'multiRegions' }
	]
	const bucketType = yield promptList({ message: 'Choose a bucket type:', choices, separator: false, noAbort: true })
	const regions = yield gcp.bucket.getRegions()
	const locations = regions[bucketType]
	const locationChoices = locations.map((l,idx) => ({
		name: ` ${idx+1}. ${l.name}`, value: l.id
	}))
	
	const locationId = yield promptList({ message: `Choose one of the following ${bold(bucketType == 'singleRegions' ? 'Single Regions' : 'Multi Regions')}:`, locationChoices, separator: false })
	return locationId
})

/**
 * [* description]
 * @param {String}  projectId 	
 * @param {String}  bucketId 	
 * @param {String}  locationId 	
 * @param {Boolean} isPublic 	Default false. Determines whether the bucket should be public or not.
 * @param {String}  token 		
 * @param {Boolean} silent 		Default true. Determines whether console messages should be output or not.
 * 
 * @yield {Void}
 */
const createOrUpdate = ({ projectId, bucketId, locationId, isPublic, token, silent }) => co(function *(){
	silent = silent === undefined ? true : silent
	let waitDone = () => null
	const storage = client.new({ projectId })
	const bucket = storage.bucket(bucketId)
	if (!silent) waitDone = wait('Check if bucket exists...')
	const bucketExists = yield bucket.exists({ token })
	waitDone()
	if (bucketExists && isPublic) {
		if (!silent) waitDone = wait('Check if bucket is public...')
		const bucketIsPublic = yield bucket.isPublic({ token })
		waitDone()
		if (!bucketIsPublic) {
			if (!silent) console.log(warn(`Bucket ${bold(bucketId)} is not public!`))
			if (!silent) waitDone = wait(`Making bucket ${bucketId} public now...`)
			yield bucket.addPublicAccess({ token })
			waitDone()
			if (!silent) console.log(success(`Bucket ${bold(bucketId)} successfully made public!`))
		}
	} else if (!bucketExists) {
		if (!silent) console.log(warn(`Bucket ${bold(bucketId)} does not exist yet!`))
		if (!silent) waitDone = wait(`Creating ${isPublic ? 'public ' : '' }bucket now...`)
		yield bucket.create({ location:locationId, token })
		waitDone()
		if (isPublic) {
			yield bucket.addPublicAccess({ token })
			if (!silent) console.log(success(`Public bucket ${bold(bucketId)} successfully created!`))
		} else if (!silent) 
			console.log(success(`Bucket ${bold(bucketId)} successfully created!`))
	}
})

const listFiles = ({ projectId, bucketId, token }) => co(function *(){
	const storage = client.new({ projectId })
	const bucket = storage.bucket(bucketId) 
	const files = (yield bucket.object('/').list({ token })) || []
	return files.map(({ name }) => name)
})

/**
 * 
 * @param {[String]} files 		File paths on Google Cloud Bucket. They are relative to the bucket.
 * @param {String}   token 	
 * @param {Boolean}  silent 	Default true. Determines whether console messages should be output or not.
 * @yield {Void}
 */
const deleteFiles = ({ projectId, bucketId, files, token, silent }) => co(function *(){
	files = files || []
	silent = silent === undefined ? true : silent
	let waitDone = () => null
	const storage = client.new({ projectId })
	const bucket = storage.bucket(bucketId)
	const l = files.length 
	if (l > 0) {
		if (!silent) waitDone = wait(`Deleting ${l} file${l > 1 ? 's' : ''} from bucket '${bucketId}' now...`)
		const deleteTasks = files.map(f => (() => bucket.object(f).delete({ token })))
		yield throttle(deleteTasks,20)
		waitDone()
		if (!silent) console.log(success(`${l} file${l > 1 ? 's' : ''} successfully deleted`))
	}
})

/**
 * 
 * @param {String}  projectId 	
 * @param {String} 	bucketId 	
 * @param {String}  files[].file 	Absolute file paths on this machine, e.g., '/Users/you/Documents/project/media/css/style.css'.
 * @param {String}  files[].dst 	Relative destination path in the bucket, e.g., 'media/css/style.css'.	
 * @param {String}  token 		
 * @param {Boolean} silent 			Default true. Determines whether console messages should be output or not.
 * @yield {Void} 
 */
const upload = ({ projectId, bucketId, files, token, silent }) => co(function *(){
	files = files || []
	silent = silent === undefined ? true : silent
	let waitDone = () => null
	const storage = client.new({ projectId })
	const bucket = storage.bucket(bucketId)
	const l = files.length 
	if (l > 0) {
		if (!silent) waitDone = wait(`Uploading ${l} file${l > 1 ? 's' : ''} to bucket '${bucketId}' now...`)
		const uploadTasks = files.map(({ file, dst }) => (() => bucket.object(dst).insertFile(file, { token })))
		yield throttle(uploadTasks,20)
		waitDone()
		if (!silent) console.log(success(`${l} file${l > 1 ? 's' : ''} successfully uploaded`))
	}
})

module.exports = {
	chooseName,
	chooseLocation,
	findUniqueName,
	createOrUpdate,
	listFiles,
	delete: deleteFiles,
	upload
}





