/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

const { assert } = require('chai')
const { join } = require('path')
const gcpDeploy = require('../src/providers/google/deploy')

describe('google', () => {
	describe('deploy', () => {
		describe('#getHandlers', () => {
			it('01 - Should return an empty \'handlers\' config if the \'handlers\' prop contains empty \'script\' and if an \'app.js\' is present', () => {
				const allProjectFiles = [
					join('projectRoot', 'app.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				let hostingConfig = {}
				let handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isNotOk(handlers, '01')

				hostingConfig = { handlers: [{ urlRegex: '.*' }] }
				handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isOk(handlers, '02')
				assert.equal(handlers.length, 1, '03')
				assert.equal(handlers[0].urlRegex, '.*', '04')
				assert.equal(handlers[0].script.scriptPath, 'app.js', '05')
			})
			it('02 - Should return the \'handlers\' config based on the existing files if the \'handlers\' prop contains empty \'script\' and if no \'app.js\' is present but a \'server.js\' or \'index.js\' is present.', () => {
				let allProjectFiles = [
					join('projectRoot', 'index.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				let hostingConfig = {}
				let handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isOk(handlers, '01')
				assert.isOk(handlers.length > 0, '02')
				assert.isOk(handlers[0], '03')
				assert.equal(handlers[0].urlRegex, '.*', '04')
				assert.equal(handlers[0].script.scriptPath, 'index.js', '05')

				allProjectFiles = [
					join('projectRoot', 'server.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isOk(handlers, '06')
				assert.isOk(handlers.length > 0, '07')
				assert.isOk(handlers[0], '08')
				assert.equal(handlers[0].urlRegex, '.*', '09')
				assert.equal(handlers[0].script.scriptPath, 'server.js', '10')

				allProjectFiles = [
					join('projectRoot', 'index.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				hostingConfig = { handlers: [{ urlRegex: '.*' }, { urlRegex: '/home/.*', script: { scriptPath: 'index.js' } }] }
				handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isOk(handlers, '11')
				assert.isOk(handlers.length == 2, '12')
				assert.isOk(handlers[0], '13')
				assert.equal(handlers[0].urlRegex, '.*', '14')
				assert.equal(handlers[0].script.scriptPath, 'index.js', '15')
				assert.equal(handlers[1].urlRegex, '/home/.*', '16')
				assert.equal(handlers[1].script.scriptPath, 'index.js', '17')

				allProjectFiles = [
					join('projectRoot', 'server.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				hostingConfig = { handlers: [{ urlRegex: '.*' }, { urlRegex: '/home/.*', script: { scriptPath: 'server.js' } }] }
				handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isOk(handlers, '18')
				assert.isOk(handlers.length == 2, '19')
				assert.isOk(handlers[0], '20')
				assert.equal(handlers[0].urlRegex, '.*', '21')
				assert.equal(handlers[0].script.scriptPath, 'server.js', '22')
				assert.equal(handlers[1].urlRegex, '/home/.*', '23')
				assert.equal(handlers[1].script.scriptPath, 'server.js', '24')
			})
			it('03 - Should throw an exception containing a list of suggested files that could be used in the \'handlers\' if the \'handlers\' prop contains empty \'script\' and if the project does not contain an \'app.js\', \'server.js\' or \'index.js\'.', () => {
				let allProjectFiles = [
					join('projectRoot', 'nicolas.js'),
					join('projectRoot', 'boris.js'),
					join('projectRoot', 'src', 'brendan.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				let hostingConfig = {}
				let oops
				try {
					gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
					oops = true
				} catch(e) {
					assert.equal(e.code, 501, '01')
					assert.equal(e.message, 'Missing a server file. The server file is required to start the server and start listening to requests.', '02')
					assert.isOk(e.handlers, '03')
					assert.equal(e.handlers.length, 1,'04')
					assert.equal(e.handlers[0].urlRegex, '.*','05')
					assert.equal(e.handlers[0].files[0], 'boris.js','06')
					assert.equal(e.handlers[0].files[1], 'nicolas.js','05')
				}
				if (oops)
					assert.isOk(false, '00 - Should have failed')

				allProjectFiles = [
					join('projectRoot', 'src', 'brendan.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				try {
					gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
					oops = true
				} catch(e) {
					assert.equal(e.code, 501, '06')
					assert.equal(e.message, 'Missing a server file. The server file is required to start the server and start listening to requests.', '07')
					assert.isOk(e.handlers, '08')
					assert.equal(e.handlers.length, 1,'09')
					assert.equal(e.handlers[0].urlRegex, '.*' ,'10')
					assert.equal(e.handlers[0].files.length, 0 ,'11')
				}
				if (oops)
					assert.isOk(false, '12 - Should have failed')
			})
			it('04 - Should throw an exception containing a list of suggested files that could be used in the \'handlers\' if the \'handlers\' prop contains empty \'script\' and the project contains one of the following files at once: \'app.js\', \'server.js\' or \'index.js\'.', () => {
				const allProjectFiles = [
					join('projectRoot', 'app.js'),
					join('projectRoot', 'server.js'),
					join('projectRoot', 'src', 'brendan.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				const hostingConfig = {}
				let oops
				try {
					gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
					oops = true
				} catch(e) {
					assert.equal(e.code, 502, '01')
					assert.equal(e.message, 'Ambiguous files. Cannot decide which file should be used to serve traffic.', '02')
					assert.isOk(e.handlers, '03')
					assert.equal(e.handlers.length, 1,'04')
					assert.equal(e.handlers[0].urlRegex, '.*', '05')
					assert.equal(e.handlers[0].files[0], 'app.js','06')
					assert.equal(e.handlers[0].files[1], 'server.js','07')
				}
				if (oops)
					assert.isOk(false, '00 - Should have failed')
			})
			it('05 - Should throw an exception if there are files defined in the \'handlers\' that do not exist in the project.', () => {
				let allProjectFiles = [
					join('projectRoot', 'app.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				let hostingConfig = {
					handlers: [{
						urlRegex: '.*',
						script: { scriptPath: 'server.js' }
					}, {
						urlRegex: './home/*',
						script: { scriptPath: 'app.js' }
					}, {
						urlRegex: './aboutus/*',
						script: { scriptPath: 'aboutus.js' }
					}]
				}
				let oops
				try {
					gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
					oops = true
				} catch(e) {
					assert.equal(e.code, 404, '01')
					assert.equal(e.message, 'Files not found. Handler scripts are referencing missing files.', '02')
					assert.isOk(e.handlers, '03')
					assert.equal(e.handlers.length, 2,'04')
					assert.equal(e.handlers[0].urlRegex, '.*','05')
					assert.equal(e.handlers[0].script.scriptPath, 'server.js','06')
					assert.equal(e.handlers[1].urlRegex, './aboutus/*','07')
					assert.equal(e.handlers[1].script.scriptPath, 'aboutus.js','08')
				}
				if (oops)
					assert.isOk(false, '00 - Should have failed')

				hostingConfig = {
					handlers: [{
						urlRegex: '.*'
					}, {
						urlRegex: './home/*',
						script: { scriptPath: 'app.js' }
					}, {
						urlRegex: './aboutus/*',
						script: { scriptPath: 'aboutus.js' }
					}]
				}
				try {
					gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
					oops = true
				} catch(e) {
					assert.equal(e.code, 404, '10')
					assert.equal(e.message, 'Files not found. Handler scripts are referencing missing files.', '11')
					assert.isOk(e.handlers, '12')
					assert.equal(e.handlers.length, 1,'13')
					assert.equal(e.handlers[0].urlRegex, './aboutus/*','14')
					assert.equal(e.handlers[0].script.scriptPath, 'aboutus.js','15')
				}
				if (oops)
					assert.isOk(false, '00 - Should have failed')
			})
			it('06 - Should NOT throw an exception containing a list of suggested files that could be used in the \'handlers\' if the \'handlers\' prop exists and the project contains one of the following files at once: \'app.js\', \'server.js\' or \'index.js\'.', () => {
				const allProjectFiles = [
					join('projectRoot', 'app.js'),
					join('projectRoot', 'server.js'),
					join('projectRoot', 'src', 'brendan.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'package.json'),
					join('projectRoot', 'app.json')
				]
				const hostingConfig = {
					handlers: [{
						urlRegex: '.*',
						script: { scriptPath: 'app.js' }
					}]
				}
				const handlers = gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
				assert.isOk(handlers, '01')
				assert.isOk(handlers.length > 0, '02')
				assert.equal(handlers.length, 1, '03')
				assert.isOk(handlers[0], '04')
				assert.equal(handlers[0].urlRegex, '.*', '05')
				assert.equal(handlers[0].script.scriptPath, 'app.js', '06')
			})
			it('07 - Should throw an exception if there is no \'package.json\' in the \'projectFiles\' argument.', () => {
				const allProjectFiles = [
					join('projectRoot', 'app.js'),
					join('projectRoot', 'server.js'),
					join('projectRoot', 'src', 'brendan.js'),
					join('projectRoot', 'index.html'),
					join('projectRoot', 'app.json')
				]
				const hostingConfig = {}
				let oops
				try {
					gcpDeploy.getHandlers(hostingConfig, allProjectFiles)
					oops = true
				} catch(e) {
					assert.equal(e.code, 503, '01')
					assert.equal(e.message, 'Missing required \'package.json\'. A nodejs project must have one.', '02')
				}
				if (oops)
					assert.isOk(false, '00 - Should have failed')
			})
		})
	})
})