/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const { bold, gray, cyan, red, underline, green } = require('chalk')
const ora2 = require('ora')
const readline = require('readline')
const inquirer = require('inquirer')
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'))
const stripAnsi = require('strip-ansi')
const ansiEscapes = require('ansi-escapes')
const { exec } = require('child_process')
const { collection } = require('./core')

/*eslint-disable */
const _removeConsoleFormatting = (txt='') => txt.toString().replace(/[\u001b]\[[0-9]+m/g, '')
/*eslint-enable */

const eraseLines = n => ansiEscapes.eraseLines(n)

const getLength = string => {
	let biggestLength = 0
	string.split('\n').map(str => {
		str = stripAnsi(str)
		if (str.length > biggestLength) {
			biggestLength = str.length
		}
		return undefined
	})
	return biggestLength
}

const highlight = text => bold.underline(text)
const info = (...msgs) => `${gray('>')} ${msgs.join('\n')}`
const debugInfo = (...msgs) => `${green('> DEBUG')} ${msgs.join('\n')}`
const success = (...msgs) => `${green('✓')} ${msgs.join('\n')}` 
const question = (...msgs) => `${green('?')} ${bold(msgs.join('\n'))}`
const note = (...msgs) => gray(info(...msgs))
const cmd = text => `${gray('`')}${cyan(text)}${gray('`')}`
const link = text => underline(text)
const aborted = msg => `${red('> Aborted!')} ${msg}`
const error = (...input) => {
	let messages = input

	if (typeof input[0] === 'object') {
		const {slug, message} = input[0]
		messages = [ message ]

		if (slug) {
			messages.push(`> More details: https://neapup/${slug}`)
		}
	}

	return `${red('> ERROR!')} ${messages.join('\n')}`
}
const warn = (...input) => {
	let messages = input

	if (typeof input[0] === 'object') {
		const {slug, message} = input[0]
		messages = [ message ]

		if (slug) {
			messages.push(`> More details: https://neapup/${slug}`)
		}
	}

	return `${red('> WARN!')} ${messages.join('\n')}`
}

const askQuestion = q => {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	})
	return (new Promise((resolve) => rl.question(question(q), resolve)))
		.then(answer => {
			rl.close()
			return answer
		})
}

const promptList = ({
	message = 'the question',
	choices = [
		{
			name: 'something\ndescription\ndetails\netc',
			value: 'something unique',
			short: 'generally the first line of `name`'
		}
	],
	pageSize = 15, // Show 15 lines without scrolling (~4 credit cards)
	abort = 'end', // Wether the `abort` option will be at the `start` or the `end`,
	eraseFinalAnswer = false, // If true, the line with the final answer that inquirer prints will be erased before returning
	noAbort = false
}) => {
	let biggestLength = 0

	const specialOps = choices.filter(choice => choice.name && choice.specialOps).map(choice => {
		if (choice.name) {
			const length = getLength(choice.name)
			if (length > biggestLength) {
				biggestLength = length
			}
			return choice
		}
	})

	choices = choices.filter(choice => choice.name && !choice.specialOps).map(choice => {
		if (choice.name) {
			const length = getLength(choice.name)
			if (length > biggestLength) {
				biggestLength = length
			}
			return choice
		}
	})

	const abortSeparator = new inquirer.Separator('─'.repeat(biggestLength))
	const _abort = {
		name: 'Abort',
		value: undefined
	}

	if (!noAbort) {
		if (abort === 'start') {
			const blankSep = choices.shift()
			choices.unshift(abortSeparator)
			choices.unshift(...specialOps, _abort)
			choices.unshift(blankSep)
		} else {
			choices.push(abortSeparator)
			choices.push(...specialOps, _abort)
		}
	}

	const nonce = Date.now()
	return inquirer.prompt({
		name: nonce,
		type: 'list',
		message,
		choices,
		pageSize
	}).then(answer => {
		if (eraseFinalAnswer === true) 
			process.stdout.write(eraseLines(2))
		return answer[nonce]
	})
}

/**
 * [description]
 * @param  {String} message  		Question
 * @param  {[String]} choices  		String array containing all the choices
 * @param  {Function} filterFn 		(input, choicesLeft) => ... where 'input' is the string input from the user and 
 *                               	'choicesLeft' is the subset of 'choices' that currently match the previous 'input'
 * @return {String}          		One of the value in 'choices'
 */
const searchAnswer = (message, choices, filterFn) => {
	return inquirer.prompt([{
		type: 'autocomplete',
		name: 'data',
		message,
		source: (answersSoFar, input) => Promise.resolve(null).then(() => filterFn(input, choices))
	}]).then(({ data }) => data)
}

const execCommand = command => new Promise((success, failure) => {
	exec(command, { stdio: 'inherit' }, (e, stdout, stderr) => {
		if (e) {
			console.log(error(`Failed to execute command '${command}'. Details: ${e}`))
			console.log(error(stderr))
			failure()
		} else
			success()
	})
})

const wait = (msg, timeOut = 300, ora = ora2) => {
	let running = false
	let spinner
	let stopped = false

	setTimeout(() => {
		if (stopped) return
    
		spinner = ora(gray(msg))
		spinner.color = 'gray'
		spinner.start()
    
		running = true
	}, timeOut)

	const cancel = () => {
		stopped = true
		if (running) {
			spinner.stop()
			process.stderr.write(eraseLines(1))
			running = false
		}
		process.removeListener('nowExit', cancel)
	}

	process.on('nowExit', cancel)
	return cancel
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

const _formatRows = (rows=[], options={}) => {
	if (rows.length == 0)
		return rows 

	const props = Object.keys(rows[0])
	const separator = props.reduce((acc,prop) => {
		acc[prop] = '-'
		return acc
	}, {})
	return rows.reduce((acc, row) => {

		const arrayLength = props.reduce((a,key) => {
			const v = row[key]
			const l = (v || {}).length
			return Array.isArray(v) && l > a ? l : a
		}, 0)
		if (arrayLength > 0) 
			collection.seed(arrayLength).forEach((_,idx) => {
				const firstRow = idx == 0
				acc.push(props.reduce((a,prop) => {
					const v = row[prop] || ''
					const isArray = Array.isArray(v)
					a[prop] = isArray 
						? (v[idx] || '')
						: firstRow ? v : ''
					return a
				}, {}))
			})
		else 
			acc.push(props.reduce((a,prop) => {
				const v = row[prop] || ''
				a[prop] = v
				return a
			}), {})

		if (options.separator)
			acc.push(separator)			

		return acc
	}, [])
}

/**
 * [description]
 * @param  {[Object]} rows    				[description]
 * @param  {String}  options.indent 		Default is ''.
 * @param  {String}   options.separator 
 * @param  {Boolean}  options.quiet 		Default is false. If true, this will not write anything to stdout						                                       
 * @return {[type]}         				[description]
 */
const displayTable = (rows, options={}) => {
	if (!rows || !rows.length)
		return []

	const formattedRows = _formatRows(rows, { separator: options.separator === undefined ? true : options.separator })
	const opts = { paddingLeft: 1, paddingRight: 1 }
	const headerOpts = { paddingLeft: 1, paddingRight: 1, format: (x) => bold(gray(x.toUpperCase())) }
	const columns = Object.keys(formattedRows[0]).map(colName => {
		const colWidth = _getMaxColWidth([colName, ...formattedRows.map(v => _removeConsoleFormatting(v[colName]))], opts)
		const header = _adjustContentToWidth(colName, colWidth, headerOpts)
		const nonFormattedhHeader = _adjustContentToWidth(colName, colWidth, Object.assign({}, headerOpts, { format: null }))
		const colItems = formattedRows.map(v => _adjustContentToWidth(v[colName], colWidth, opts))
		return { header, nonFormattedhHeader, items: colItems }
	})

	const head = `|${columns.map(x => x.header).join('|')}|`
	const nonFormattedHead = `|${columns.map(x => x.nonFormattedhHeader).join('|')}|`
	const line = collection.seed(nonFormattedHead.length).map(() => '=').join('')
	const lineSep = collection.seed(nonFormattedHead.length).map(() => '─').join('')
	const stringRows = [ head, line, ...formattedRows.map((row, idx) => {
		const rowcells = columns.map(col => (col.items || [])[idx])
		const reformattedCells = options.format ? rowcells.map(c => options.format(c)) : rowcells
		const s = '|'
		const showLine = reformattedCells.every(v => v.trim() == '-')
		return !showLine ? `${s}${reformattedCells.join(s)}${s}` : lineSep
	})]
	if (!options.hide || !options.quiet) {
		console.log('')
		stringRows.forEach(row => console.log(`${options.indent || ''}${row}`))
		console.log('')
	}

	return stringRows 
}

/**
 * [description]
 * @param  {[type]} items   		[description]
 * @param  {String} options.indent 	[description]
 * @param  {String} options.prefix 	[description]
 * @return {[type]}         		[description]
 */
const displayList = (items, options={}) => {
	if (!items || items.length == 0)
		return
	
	if (!Array.isArray(items))
		throw new Error('Invalid argument exception. \'items\' must be an Array')
	
	const { indent='', prefix='- ' } = options
	const emptyPrefix = collection.seed(prefix.length).map(() => ' ').join('')
	const list = []
	items.forEach((item, idx) => {
		if (!item)
			throw new Error(`Missing required argument. Item ${idx} in 'items' array is required.`)
		if (!item.name)
			throw new Error(`Missing required argument. Item ${idx} in 'items' array is missing the required 'name' property.`)

		const { name, value } = item
		if (Array.isArray(name)) {
			const end = name.length - 1
			name.forEach((n,i) => list.push({ name: `${indent}${i == 0 ? prefix : emptyPrefix}${n}${i == end ? ':' : ''}`, value: i == end ? value : '' }))
		} else 
			list.push({ name: (`${indent}${prefix}${name}:`), value })
	})

	const maxNameLength = Math.max(...list.map(l => l.name.length))
	list.forEach(({ name, value }) => {
		const diff = collection.seed(maxNameLength - name.length).map(() => ' ').join('')
		console.log(`${name}${diff}  ${bold(value)}`)
	})
}

/**
 * [description]
 * @param  {String} title   			[description]
 * @param  {String}  options.indent 	Default is ''.
 * @param  {Boolean} options.quiet 		Default is false. If true, this will not write anything to stdout
 * @return {[type]}         			[description]
 */
const displayTitle = (title='', options={}) => {
	const rawTitle = _removeConsoleFormatting(title)
	const indent = options.indent || ''
	const underline = collection.seed(rawTitle.length).map(() => '=').join('')
	if (!options.quiet) {
		console.log(' ')
		console.log(`\n${indent}${title}`)
		console.log(`${indent}${collection.seed(rawTitle.length).map(() => '=').join('')}`)
		console.log(' ')
	}
	return { title, rawTitle, underline, indent }
}

module.exports = {
	aborted,
	askQuestion,
	bold,
	cmd,
	cyan,
	debugInfo: debugInfo,
	error,
	exec: execCommand,
	gray,
	highlight,
	info,
	link,
	note,
	promptList,
	question,
	red,
	success,
	wait,
	warn,
	displayTable,
	displayTitle,
	searchAnswer,
	displayList
}