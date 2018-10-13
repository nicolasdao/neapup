/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const moment = require('moment-timezone')

const getCurrent = moment.tz.guess
const getAll = moment.tz.names

module.exports = {
	all: getAll,
	system: getCurrent
}
