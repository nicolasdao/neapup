const co = require('co')
const clipboardy = require('clipboardy')
const express = require('express')
const app = express()
const { coreHelper: { getAbsolutePath } } = require('../helpers')

const start = port => new Promise(resolve => app.listen(port,resolve))

const styleIt = code => text => `\x1b[${code}m${text}\x1b[0m`

const color = {
	red: styleIt('31'),
	blue: styleIt('34'),
	green: styleIt('32'),
	cyan: styleIt('36'),
	magenta: styleIt('35'),
	white: (...args) => console.log(...args),
	underline: styleIt('4'),
	italic: styleIt('3'),
	bold: styleIt('1')
}

const serve = (projectPath, port) => co(function *() {
	const p = getAbsolutePath(projectPath)
	port = port || 3000
	app.use(express.static(p))

	yield start(port || 3000)
	const uri = `http://localhost:${port}`
	yield clipboardy.write(uri)
	console.log(color.cyan(`\nLocal server started at ${color.underline(color.italic(uri))} (copied to clipboard)`))
})


module.exports = serve

