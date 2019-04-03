# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="0.23.2"></a>
## [0.23.2](https://gitlab.com/neap/neap-manager/compare/v0.23.1...v0.23.2) (2019-04-03)


### Features

* Automatically display the custom domain after successful deployment if the bucket has been configured as such ([ae4bd90](https://gitlab.com/neap/neap-manager/commit/ae4bd90))



<a name="0.23.1"></a>
## [0.23.1](https://gitlab.com/neap/neap-manager/compare/v0.23.0...v0.23.1) (2019-04-03)


### Bug Fixes

* Deploying a static website throws an error if there is no package.json defined ([19c88d5](https://gitlab.com/neap/neap-manager/commit/19c88d5))



<a name="0.23.0"></a>
# [0.23.0](https://gitlab.com/neap/neap-manager/compare/v0.22.39...v0.23.0) (2019-04-03)


### Features

* Add support for deploying static websites: phase II ([a8380cc](https://gitlab.com/neap/neap-manager/commit/a8380cc))
* Add support for website deployment - phase I ([ca1909a](https://gitlab.com/neap/neap-manager/commit/ca1909a))



<a name="0.22.39"></a>
## [0.22.39](https://gitlab.com/neap/neap-manager/compare/v0.22.38...v0.22.39) (2019-01-14)


### Features

* Add more regions to the Task Cloud API supported regions white list ([3da829d](https://gitlab.com/neap/neap-manager/commit/3da829d))



<a name="0.22.38"></a>
## [0.22.38](https://gitlab.com/neap/neap-manager/compare/v0.22.37...v0.22.38) (2019-01-13)


### Features

* Commit missing commit ([820d576](https://gitlab.com/neap/neap-manager/commit/820d576))



<a name="0.22.37"></a>
## [0.22.37](https://gitlab.com/neap/neap-manager/compare/v0.22.36...v0.22.37) (2019-01-13)


### Features

* Add support for verifying domain and website ownership ([c3008d8](https://gitlab.com/neap/neap-manager/commit/c3008d8))



<a name="0.22.36"></a>
## [0.22.36](https://gitlab.com/neap/neap-manager/compare/v0.22.35...v0.22.36) (2018-11-21)


### Bug Fixes

* Cannot add a new bigquery DB when there are no DB at all ([0eeba08](https://gitlab.com/neap/neap-manager/commit/0eeba08))



<a name="0.22.35"></a>
## [0.22.35](https://gitlab.com/neap/neap-manager/compare/v0.22.34...v0.22.35) (2018-11-21)


### Bug Fixes

* Multi-regions buckets are shown as standard + allow to add '.' in bucket names ([3a245aa](https://gitlab.com/neap/neap-manager/commit/3a245aa))



<a name="0.22.34"></a>
## [0.22.34](https://gitlab.com/neap/neap-manager/compare/v0.22.33...v0.22.34) (2018-11-20)


### Features

* Add support for manually setting up the runtime in the app.json ([59d31f4](https://gitlab.com/neap/neap-manager/commit/59d31f4))



<a name="0.22.33"></a>
## [0.22.33](https://gitlab.com/neap/neap-manager/compare/v0.22.32...v0.22.33) (2018-11-20)


### Features

* Remove file size quotas check during deployment + remove merging/diffing app.<env>.json files with the original app.json ([d62d63a](https://gitlab.com/neap/neap-manager/commit/d62d63a))



<a name="0.22.32"></a>
## [0.22.32](https://gitlab.com/neap/neap-manager/compare/v0.22.31...v0.22.32) (2018-11-14)


### Features

* Add new roles for CloudTasks ([6a786b5](https://gitlab.com/neap/neap-manager/commit/6a786b5))



<a name="0.22.31"></a>
## [0.22.31](https://gitlab.com/neap/neap-manager/compare/v0.22.30...v0.22.31) (2018-11-09)


### Features

* Add support to create table from bucket's data in BigQuery ([dfd3317](https://gitlab.com/neap/neap-manager/commit/dfd3317))



<a name="0.22.30"></a>
## [0.22.30](https://gitlab.com/neap/neap-manager/compare/v0.22.29...v0.22.30) (2018-11-06)


### Features

* Add support for add bucket ([6561933](https://gitlab.com/neap/neap-manager/commit/6561933))
* Add support for adding/deleting BigQuery DB and Tables ([9e6a1f5](https://gitlab.com/neap/neap-manager/commit/9e6a1f5))
* Add support to deleted a bucket and check if a bucket's name is available ([0bb77d3](https://gitlab.com/neap/neap-manager/commit/0bb77d3))



<a name="0.22.29"></a>
## [0.22.29](https://gitlab.com/neap/neap-manager/compare/v0.22.28...v0.22.29) (2018-11-03)


### Bug Fixes

* Deploying to standard fails. 'scriptPath' must be set to auto ([3b57573](https://gitlab.com/neap/neap-manager/commit/3b57573))


### Features

* Add support for listing: BigQuery DBs and Tables + Buckets ([1c41fba](https://gitlab.com/neap/neap-manager/commit/1c41fba))



<a name="0.22.28"></a>
## [0.22.28](https://gitlab.com/neap/neap-manager/compare/v0.22.27...v0.22.28) (2018-10-25)


### Features

* Add support for enabling Google APIs ([8d8fd57](https://gitlab.com/neap/neap-manager/commit/8d8fd57))



<a name="0.22.27"></a>
## [0.22.27](https://gitlab.com/neap/neap-manager/compare/v0.22.26...v0.22.27) (2018-10-23)


### Features

* Allow to add any role to a user ([4f6c0b8](https://gitlab.com/neap/neap-manager/commit/4f6c0b8))



<a name="0.22.26"></a>
## [0.22.26](https://gitlab.com/neap/neap-manager/compare/v0.22.25...v0.22.26) (2018-10-23)


### Features

* Add more granular control to add access to users ([5e2ef38](https://gitlab.com/neap/neap-manager/commit/5e2ef38))
* Add support for adding users and service accounts ([5e88f09](https://gitlab.com/neap/neap-manager/commit/5e88f09))
* Add support for listing collaborators of a project ([6032429](https://gitlab.com/neap/neap-manager/commit/6032429))
* Add support for removing access ([7533860](https://gitlab.com/neap/neap-manager/commit/7533860))



<a name="0.22.25"></a>
## [0.22.25](https://gitlab.com/neap/neap-manager/compare/v0.22.24...v0.22.25) (2018-10-13)



<a name="0.22.24"></a>
## [0.22.24](https://gitlab.com/neap/neap-manager/compare/v0.22.23...v0.22.24) (2018-10-13)



<a name="0.22.23"></a>
## [0.22.23](https://gitlab.com/neap/neap-manager/compare/v0.22.22...v0.22.23) (2018-10-11)


### Features

* Make the Cron job creation clearer ([fe6fa66](https://gitlab.com/neap/neap-manager/commit/fe6fa66))



<a name="0.22.22"></a>
## [0.22.22](https://gitlab.com/neap/neap-manager/compare/v0.22.21...v0.22.22) (2018-10-11)


### Features

* Update the unit of the zip file to KB when the package is small ([33cb7d9](https://gitlab.com/neap/neap-manager/commit/33cb7d9))



<a name="0.22.21"></a>
## [0.22.21](https://gitlab.com/neap/neap-manager/compare/v0.22.20...v0.22.21) (2018-10-11)


### Features

* Improve the task queue creation by auto populating the queue name with the service it targets ([a5fcf17](https://gitlab.com/neap/neap-manager/commit/a5fcf17))



<a name="0.22.20"></a>
## [0.22.20](https://gitlab.com/neap/neap-manager/compare/v0.22.19...v0.22.20) (2018-10-11)


### Features

* Auto create a service account that can push tasks to queues after the first queue is created + auto generate the JSON key for that service account ([427303e](https://gitlab.com/neap/neap-manager/commit/427303e))



<a name="0.22.19"></a>
## [0.22.19](https://gitlab.com/neap/neap-manager/compare/v0.22.18...v0.22.19) (2018-10-11)


### Features

* Generating and deleting JSON keys for service account ([fc614ec](https://gitlab.com/neap/neap-manager/commit/fc614ec))



<a name="0.22.18"></a>
## [0.22.18](https://gitlab.com/neap/neap-manager/compare/v0.22.17...v0.22.18) (2018-10-10)


### Bug Fixes

* Prevent to enter invalid queue name ([9356661](https://gitlab.com/neap/neap-manager/commit/9356661))


### Features

* Add a new option in the ls and a command to manage service accounts as well as generate JSON keys ([1fcec61](https://gitlab.com/neap/neap-manager/commit/1fcec61))



<a name="0.22.17"></a>
## [0.22.17](https://gitlab.com/neap/neap-manager/compare/v0.22.16...v0.22.17) (2018-10-09)


### Features

* Explicitely help creating the app.json if it does not exist at deployment time ([013a2d4](https://gitlab.com/neap/neap-manager/commit/013a2d4))



<a name="0.22.16"></a>
## [0.22.16](https://gitlab.com/neap/neap-manager/compare/v0.22.15...v0.22.16) (2018-10-09)


### Features

* Auto enable Cloud Task API after a project has been created and the billing has been enabled ([a4267ba](https://gitlab.com/neap/neap-manager/commit/a4267ba))



<a name="0.22.15"></a>
## [0.22.15](https://gitlab.com/neap/neap-manager/compare/v0.22.14...v0.22.15) (2018-10-09)


### Features

* Add new listing options ([242f516](https://gitlab.com/neap/neap-manager/commit/242f516))



<a name="0.22.14"></a>
## [0.22.14](https://gitlab.com/neap/neap-manager/compare/v0.22.13...v0.22.14) (2018-10-09)


### Features

* Integrate the Cloud Task API ([d20f912](https://gitlab.com/neap/neap-manager/commit/d20f912))



<a name="0.22.13"></a>
## [0.22.13](https://gitlab.com/neap/neap-manager/compare/v0.22.12...v0.22.13) (2018-10-07)


### Bug Fixes

* Removing a cron from a project does not work ([f8cd791](https://gitlab.com/neap/neap-manager/commit/f8cd791))



<a name="0.22.12"></a>
## [0.22.12](https://gitlab.com/neap/neap-manager/compare/v0.22.11...v0.22.12) (2018-10-07)


### Features

* Add and remove cron jobs ([8627bcb](https://gitlab.com/neap/neap-manager/commit/8627bcb))
* Add command to add and remove task queues ([78d956f](https://gitlab.com/neap/neap-manager/commit/78d956f))



<a name="0.22.11"></a>
## [0.22.11](https://gitlab.com/neap/neap-manager/compare/v0.22.10...v0.22.11) (2018-10-04)


### Features

* Include the app.yaml even for standard env ([9e0a588](https://gitlab.com/neap/neap-manager/commit/9e0a588))



<a name="0.22.10"></a>
## [0.22.10](https://gitlab.com/neap/neap-manager/compare/v0.22.9...v0.22.10) (2018-10-04)


### Bug Fixes

* Double menu when using the list command ([914f972](https://gitlab.com/neap/neap-manager/commit/914f972))



<a name="0.22.9"></a>
## [0.22.9](https://gitlab.com/neap/neap-manager/compare/v0.22.8...v0.22.9) (2018-10-03)


### Features

* Add new 'rm' command to delete projects, services and custom domains ([20fda96](https://gitlab.com/neap/neap-manager/commit/20fda96))



<a name="0.22.8"></a>
## [0.22.8](https://gitlab.com/neap/neap-manager/compare/v0.22.7...v0.22.8) (2018-10-03)


### Features

* Add a new 'dn' command to manage custom domains ([c4a75d3](https://gitlab.com/neap/neap-manager/commit/c4a75d3))
* Add a new 'dn' command to manage custom domains ([ae07e4a](https://gitlab.com/neap/neap-manager/commit/ae07e4a))



<a name="0.22.7"></a>
## [0.22.7](https://gitlab.com/neap/neap-manager/compare/v0.22.6...v0.22.7) (2018-10-02)


### Bug Fixes

* Remove dev log ([481e707](https://gitlab.com/neap/neap-manager/commit/481e707))



<a name="0.22.6"></a>
## [0.22.6](https://gitlab.com/neap/neap-manager/compare/v0.22.5...v0.22.6) (2018-10-02)



<a name="0.22.5"></a>
## [0.22.5](https://gitlab.com/neap/neap-manager/compare/v0.22.4...v0.22.5) (2018-09-29)


### Bug Fixes

* Duplicate the app.json ([f327836](https://gitlab.com/neap/neap-manager/commit/f327836))



<a name="0.22.4"></a>
## [0.22.4](https://gitlab.com/neap/neap-manager/compare/v0.22.3...v0.22.4) (2018-09-29)


### Features

* Add a stylished help command as well as a version command ([a98eb10](https://gitlab.com/neap/neap-manager/commit/a98eb10))



<a name="0.22.3"></a>
## [0.22.3](https://gitlab.com/neap/neap-manager/compare/v0.22.2...v0.22.3) (2018-09-29)


### Bug Fixes

* Weird format when creating an app.json for the first time ([9634fa5](https://gitlab.com/neap/neap-manager/commit/9634fa5))



<a name="0.22.2"></a>
## [0.22.2](https://gitlab.com/neap/neap-manager/compare/v0.22.1...v0.22.2) (2018-09-28)


### Bug Fixes

* Restart a stopped flexible env ([64e7b00](https://gitlab.com/neap/neap-manager/commit/64e7b00))
* Saving a new duplicated app.json file throws an error ([0c633da](https://gitlab.com/neap/neap-manager/commit/0c633da))


### Features

* Start or stop a service ([0bfa927](https://gitlab.com/neap/neap-manager/commit/0bfa927))



<a name="0.22.1"></a>
## 0.22.1 (2018-09-26)


### Features

* 1st commit ([be25ed1](https://gitlab.com/neap/neap-manager/commit/be25ed1))
* Allow to skip cleaning question at the end of a deployement ([203684f](https://gitlab.com/neap/neap-manager/commit/203684f))
* Check quotas for standard project ([225c203](https://gitlab.com/neap/neap-manager/commit/225c203))



<a name="0.22.0"></a>
# [0.22.0](https://gitlab.com/neap/webfunc/compare/v0.21.0...v0.22.0) (2018-09-25)



<a name="0.21.0"></a>
# [0.21.0](https://gitlab.com/neap/webfunc/compare/v0.20.0...v0.21.0) (2018-09-25)


### Features

* Managing handlers ([5d11d15](https://gitlab.com/neap/webfunc/commit/5d11d15))



<a name="0.20.0"></a>
# [0.20.0](https://github.com/webfuncjs/webfunc/compare/v0.19.0...v0.20.0) (2018-09-21)


### Features

* Help user choose the right app.json ([369e418](https://github.com/webfuncjs/webfunc/commit/369e418))



<a name="0.19.0"></a>
# [0.19.0](https://github.com/webfuncjs/webfunc/compare/v0.18.4...v0.19.0) (2018-09-20)


### Features

* Add a package.json validation to make sure that it contains a start script ([4fba33a](https://github.com/webfuncjs/webfunc/commit/4fba33a))



<a name="0.18.4"></a>
## [0.18.4](https://github.com/webfuncjs/webfunc/compare/v0.18.3...v0.18.4) (2018-09-20)


### Bug Fixes

* Update workflow to better deal with projects with no app engine ([a12c430](https://github.com/webfuncjs/webfunc/commit/a12c430))



<a name="0.18.3"></a>
## [0.18.3](https://github.com/webfuncjs/webfunc/compare/v0.18.2...v0.18.3) (2018-09-20)


### Bug Fixes

* undefined options throw exception ([9c3f792](https://github.com/webfuncjs/webfunc/commit/9c3f792))



<a name="0.18.2"></a>
## [0.18.2](https://github.com/webfuncjs/webfunc/compare/v0.18.1...v0.18.2) (2018-09-20)



<a name="0.18.1"></a>
## [0.18.1](https://github.com/webfuncjs/webfunc/compare/v0.18.0...v0.18.1) (2018-09-20)


### Bug Fixes

* undefined options throw exception ([0c6aa23](https://github.com/webfuncjs/webfunc/commit/0c6aa23))



<a name="0.18.0"></a>
# [0.18.0](https://github.com/webfuncjs/webfunc/compare/v0.17.0...v0.18.0) (2018-09-20)


### Features

* 'clean' command: Collecting and presenting the data ([ada10ec](https://github.com/webfuncjs/webfunc/commit/ada10ec))
* Add an update command, an assistant to create an app.json file ([77bc48b](https://github.com/webfuncjs/webfunc/commit/77bc48b))
* Add listing both the Projects and Services details ([4abeca6](https://github.com/webfuncjs/webfunc/commit/4abeca6))
* Add new gcp api to enable/disable service apis as well as to check if they have been enabled ([e3fab55](https://github.com/webfuncjs/webfunc/commit/e3fab55))
* Add services and versions count stats in the ls command ([b430e30](https://github.com/webfuncjs/webfunc/commit/b430e30))
* Add support for App Engine Flexible env. deployment ([8dc1359](https://github.com/webfuncjs/webfunc/commit/8dc1359))
* Adding a functioning 'clean' command ([eb41f65](https://github.com/webfuncjs/webfunc/commit/eb41f65))
* Deal with flexible service api not enabled yet ([282794d](https://github.com/webfuncjs/webfunc/commit/282794d))
* Deliver 2 fully functional commands: 'ls' and 'clean' ([e45ef29](https://github.com/webfuncjs/webfunc/commit/e45ef29))
* In the process of adding a new command called 'clean' ([6aeab4a](https://github.com/webfuncjs/webfunc/commit/6aeab4a))
* Making sure we automatically minimize billing when deploying a new version ([bd46561](https://github.com/webfuncjs/webfunc/commit/bd46561))



<a name="0.17.0"></a>
# [0.17.0](https://github.com/webfuncjs/webfunc/compare/v0.16.1...v0.17.0) (2018-09-12)


### Features

* Add an 'init' command to create app.json files ([5b71d03](https://github.com/webfuncjs/webfunc/commit/5b71d03))



<a name="0.16.0"></a>
# [0.16.0](https://github.com/webfuncjs/webfunc/compare/v0.16.1...v0.16.0) (2018-09-12)


### Features

* Add an 'init' command to create app.json files ([5b71d03](https://github.com/webfuncjs/webfunc/commit/5b71d03))



<a name="0.15.2"></a>
## [0.15.2](https://github.com/nicolasdao/webfunc/compare/v0.15.1...v0.15.2) (2018-09-11)


### Bug Fixes

* Throw error when it exists. Replace process.exit(1) with process.exit() ([931922f](https://github.com/nicolasdao/webfunc/commit/931922f))



<a name="0.15.1"></a>
## [0.15.1](https://github.com/nicolasdao/webfunc/compare/v0.15.0...v0.15.1) (2018-09-11)


### Bug Fixes

* Missing shortid dependency in the package.json ([f8a4735](https://github.com/nicolasdao/webfunc/commit/f8a4735))



<a name="0.15.0"></a>
# [0.15.0](https://github.com/nicolasdao/webfunc/compare/v0.14.1...v0.15.0) (2018-09-11)


### Bug Fixes

* Dealing with deploying to App Engine service other than 'default' when no default has been used yet ([74710d0](https://github.com/nicolasdao/webfunc/commit/74710d0))


### Features

* Add a new 'list' command to list all the services and their resp. latest deployments ([f0dd93d](https://github.com/nicolasdao/webfunc/commit/f0dd93d))
* Add ability to choose which service to deploy to ([6bd2305](https://github.com/nicolasdao/webfunc/commit/6bd2305))
* Add command deploy. So far it can deploy a zipped package to a bucket ([275577e](https://github.com/nicolasdao/webfunc/commit/275577e))
* Add create bucket api ([86388e5](https://github.com/nicolasdao/webfunc/commit/86388e5))
* Add deploying to App Engine ([ec7e348](https://github.com/nicolasdao/webfunc/commit/ec7e348))
* Add support for app.json (both deploying based on its config and saving it based on user's deployment choices) ([286b379](https://github.com/nicolasdao/webfunc/commit/286b379))
* Add support for cleaning up App Engine project from less valuable versions when the max amount of versions (210) has been exceeded ([0482f62](https://github.com/nicolasdao/webfunc/commit/0482f62))
* Add support for cloning npm project to a specific location ([3aaf1e9](https://github.com/nicolasdao/webfunc/commit/3aaf1e9))
* Add support for environment specific app.json files ([cd9dab4](https://github.com/nicolasdao/webfunc/commit/cd9dab4))
* Add zipping nodejs. ([cb889a1](https://github.com/nicolasdao/webfunc/commit/cb889a1))
* Adding counter measure to deal with enabling billing on new projects ([08555ad](https://github.com/nicolasdao/webfunc/commit/08555ad))
* Adding new module [@webfunc](https://github.com/webfunc)/deploy ([f5cd633](https://github.com/nicolasdao/webfunc/commit/f5cd633))
* Create new project and enable billing ([614dbd4](https://github.com/nicolasdao/webfunc/commit/614dbd4))
* List services using the app.json hosting details ([b9fddb2](https://github.com/nicolasdao/webfunc/commit/b9fddb2))



<a name="0.2.0"></a>
# [0.2.0](https://github.com/nicolasdao/webfunc/compare/v0.14.1...v0.2.0) (2018-09-11)


### Bug Fixes

* Dealing with deploying to App Engine service other than 'default' when no default has been used yet ([74710d0](https://github.com/nicolasdao/webfunc/commit/74710d0))


### Features

* Add a new 'list' command to list all the services and their resp. latest deployments ([f0dd93d](https://github.com/nicolasdao/webfunc/commit/f0dd93d))
* Add ability to choose which service to deploy to ([6bd2305](https://github.com/nicolasdao/webfunc/commit/6bd2305))
* Add command deploy. So far it can deploy a zipped package to a bucket ([275577e](https://github.com/nicolasdao/webfunc/commit/275577e))
* Add create bucket api ([86388e5](https://github.com/nicolasdao/webfunc/commit/86388e5))
* Add deploying to App Engine ([ec7e348](https://github.com/nicolasdao/webfunc/commit/ec7e348))
* Add support for app.json (both deploying based on its config and saving it based on user's deployment choices) ([286b379](https://github.com/nicolasdao/webfunc/commit/286b379))
* Add support for cleaning up App Engine project from less valuable versions when the max amount of versions (210) has been exceeded ([0482f62](https://github.com/nicolasdao/webfunc/commit/0482f62))
* Add support for cloning npm project to a specific location ([3aaf1e9](https://github.com/nicolasdao/webfunc/commit/3aaf1e9))
* Add support for environment specific app.json files ([cd9dab4](https://github.com/nicolasdao/webfunc/commit/cd9dab4))
* Add zipping nodejs. ([cb889a1](https://github.com/nicolasdao/webfunc/commit/cb889a1))
* Adding counter measure to deal with enabling billing on new projects ([08555ad](https://github.com/nicolasdao/webfunc/commit/08555ad))
* Adding new module [@webfunc](https://github.com/webfunc)/deploy ([f5cd633](https://github.com/nicolasdao/webfunc/commit/f5cd633))
* Create new project and enable billing ([614dbd4](https://github.com/nicolasdao/webfunc/commit/614dbd4))
* List services using the app.json hosting details ([b9fddb2](https://github.com/nicolasdao/webfunc/commit/b9fddb2))



<a name="0.1.0"></a>
# [0.1.0](https://github.com/nicolasdao/webfunc/compare/v0.14.1...v0.1.0) (2018-09-11)


### Bug Fixes

* Dealing with deploying to App Engine service other than 'default' when no default has been used yet ([74710d0](https://github.com/nicolasdao/webfunc/commit/74710d0))


### Features

* Add a new 'list' command to list all the services and their resp. latest deployments ([f0dd93d](https://github.com/nicolasdao/webfunc/commit/f0dd93d))
* Add ability to choose which service to deploy to ([6bd2305](https://github.com/nicolasdao/webfunc/commit/6bd2305))
* Add command deploy. So far it can deploy a zipped package to a bucket ([275577e](https://github.com/nicolasdao/webfunc/commit/275577e))
* Add create bucket api ([86388e5](https://github.com/nicolasdao/webfunc/commit/86388e5))
* Add deploying to App Engine ([ec7e348](https://github.com/nicolasdao/webfunc/commit/ec7e348))
* Add support for app.json (both deploying based on its config and saving it based on user's deployment choices) ([286b379](https://github.com/nicolasdao/webfunc/commit/286b379))
* Add support for cleaning up App Engine project from less valuable versions when the max amount of versions (210) has been exceeded ([0482f62](https://github.com/nicolasdao/webfunc/commit/0482f62))
* Add support for cloning npm project to a specific location ([3aaf1e9](https://github.com/nicolasdao/webfunc/commit/3aaf1e9))
* Add support for environment specific app.json files ([cd9dab4](https://github.com/nicolasdao/webfunc/commit/cd9dab4))
* Add zipping nodejs. ([cb889a1](https://github.com/nicolasdao/webfunc/commit/cb889a1))
* Adding counter measure to deal with enabling billing on new projects ([08555ad](https://github.com/nicolasdao/webfunc/commit/08555ad))
* Adding new module [@webfunc](https://github.com/webfunc)/deploy ([f5cd633](https://github.com/nicolasdao/webfunc/commit/f5cd633))
* Create new project and enable billing ([614dbd4](https://github.com/nicolasdao/webfunc/commit/614dbd4))
* List services using the app.json hosting details ([b9fddb2](https://github.com/nicolasdao/webfunc/commit/b9fddb2))
