# NeapUp &middot;  [![NPM](https://img.shields.io/npm/v/neapup.svg?style=flat)](https://www.npmjs.com/package/neapup) [![Tests](https://travis-ci.org/nicolasdao/neapup.svg?branch=master)](https://travis-ci.org/nicolasdao/neapup) [![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause) [![Neap](https://neap.co/img/made_by_neap.svg)](#this-is-what-we-re-up-to)

Deploy serverless apps, microservices on Google App Engine and static websites on Google Cloud Bucket with a single command and less config:

`neap up`

NeapUp is a CLI tool meant to configure Google Cloud with as few steps as possible. Our DevOps team at [Neap](https://neap.co) has made countless deployments to Google Cloud in the past 3 years, and we got annoyed at the verbosity of the out-of-the-box tools. Another challenge we found was that App Engine Flexible (or even Standard) will still be charged even when there is no traffic to older versions because we did not explicitely turn them off. The aim of this CLI is to deploy your microservices or static websites to Google App Engine and [much more](#managing-other-google-cloud-resources) using a single command, zero upfront setup, and having the peace of mind that the unused versions are not occuring any unecessary costs. 

The only prerequisite of course is to have an existing Google Cloud account. The first time you run `neap up`, the CLI realizes it has no credentials stored locally on your machine. It will therefore redirect you to a Google Cloud Consent page asking you if you're ok to let the NeapUp CLI installed on your local machine to access your credentials. When you accept, your credentials are extracted on your local machine to allow the NeapUp CLI to communicate safely with your Google Cloud account via the Google Cloud web APIs.

> WARNING: At this stage of development, this CLI has not been tested in Windows. Feel free to lodge bugs when you find them in Windows and we'll look into it.

# Table Of Contents
> * [Install](#install)
> * [Getting Started](#getting-started)
>	- [Basic](#basic)
>	- [Managing Other Google Cloud Resources](#managing-other-google-cloud-resources)
>	- [Static Website](#static-website)
> * [About Neap](#this-is-what-we-re-up-to)
> * [License](#license)

# Install

```js
npm i neapup -g
```

# Getting Started
## Basics

Create a JS web app (make sure your package.json contains a `start` script similar to `"start": "NODE_ENV=production node index.js"`) or a static HTML website (make sure you have an `index.html` in your root folder) and then run:

```
neap up
```

This command prompts to answer a few questions and there you go! Your answers are stored in an `app.json` in your root folder so that the next deployment is even faster. 

> WARNING: First deploy to App Engine is different.
> Google App Engine has this really annoying requirement forcing you to have a `default` service called `default`. That means that if you intended to call your microservice `users`, this will fail during the first deployment. There is nothing NeapUp can do to fix this, this is a Google App Engine constraint. What we suggest is to deploy a empty project to the default first (e.g., health check) and then deploy your real microservice with whatever name you want.

To see all the other commands, simply run __*`neap -h`*__

# Managing Other Google Cloud Resources
## Adding New Resources

To add a new resource to your Google Cloud account, simply run __*`neap a`*__. This commands asks you to choose a resource type (e.g., project, bucket, bigquery, ...) before asking more granular questions to nail what you really need.

As of today, the following resources can be added through the NeapUp CLI:

1. __*Project*__: This is a Google Cloud Project.
2. __*CRON Job*__: The CRON job is specific to App Engine and can only trigger an endpoint hosted on GAE. __*We*__'re currently refactoring this feature with the new [Google Cloud Scheduler](https://cloud.google.com/scheduler/) which can de much more.
3. __*Task Queue*__: This is helps configuring a Task queue on [Google Cloud Task](https://cloud.google.com/tasks/).
4. __*Bucket*__: Creates a new bucket.
5. __*BigQuery*__: Create a new BigQuery DB or a new Table in a existing BigQuery DB.
6. __*Access*__: This can do multiple things related to access:
	1. Invite users to your project.
	2. Create service accounts to manage the identity of a 3rd party.
	3. Grant/remove accesses to users/service accounts.
	4. Generate a JSON key for a user or a service account. That key is what commonly used to prove a user/service account's identity.
7. __*Google APIs*__: Enable Google APIs. 
8. __*Website or Domain Ownership*__: Prove you have ownership of a domain. This might be required when you're trying to create a pubic bucket with a custom domain (more about this in section [Static Website](#static-website)).

## Listing Your Current Resources

To list your Google Cloud account resources, simply run __*`neap ls`*__. 

## Removing Your Current Resources

To remove an existing Google Cloud account resource, simply run __*`neap rm`*__. 

## Running Diagnostic On Unused App Engine Resources Still Occuring Costs

Simply run __*`neap clean`*__. This will scan all your projects for the current logged in Google Account. If an issue is found, a message will prompt you to decide whether or not you wish to resolve it.

## Static Website
### Overview - Setting Up a Bucket as a Static Website

Though a Google Cloud Bucket can be used to host a static website, a few configurations must be applied to it beforehand:

1. The bucket must be public.
2. The bucket name must represent a domain name (e.g., your-domain.com). This step is the only way to set up a custom domain.

The first setup is trivial and is automatically taken care of by `neapup`. The second one is not required to host a static website, but is recommended. Indeed, skipping the second step means that the static website is available at [https://storage.googleapis.com/your-bucket-id](https://storage.googleapis.com/your-bucket-id) rather than [https://your-custom-domain.com](https://your-custom-domain.com). This seems harmless, but this means that the web resources (i.e., js, css, images, ...) cannot use a path relative to the domain. Indeed, skipping step 2 means the static website's domain is storage.googleapis.com. A resource relative to the domain would look like [https://storage.googleapis.com/media/css/style.css](https://storage.googleapis.com/media/css/style.css), which would be not found. That's why we recommend to setup a custom domain. For more details, refer to section the [Custom Domain](#custom-domain). 

### Configuration

NeapUp is designed to avoid preemptive configuration. We want our user to focus on running the single `neap up` command to achieve their goal. We design this tool around default configurations. This section describes more advanced configuration and optimization tricks. 

#### Ignoring Files with the `.neapignore`

If there are specific files or folders you wish to ignore during your deployment, add a `.neapignore` in your root repository. The `.neapignore` uses the same convention that the `.gitignore` or `.npmignore`. Whether a `.neapignore` is defined or not, the following files are always ignored during a deployment: `.gitignore`, `.neapignore` and `.npmignore`. This behavior avoids you to create a `.neapignore` for the sake of not deploying those configuration files. 

_Example:_

To ignore the `templates` folder and the `README.md` file, add a `.neapignore` file in your repository configured as follow:
```
templates/
README.md
```

#### Custom Domain



#### `app.json`

The `app.json` is created automatically during the first deployment (using the `neap up` command). This sections describes additional settings.

Here is a typical `app.json`:

```js
{
  "hosting": {
    "type": "static-website",
    "projectId": "your-project-id",
    "bucketId": "your-bucket-id",
    "website": {
      "mainPageSuffix": "index.html",
      "notFoundPage": "404.html"
    }
  }
}
```

Where:
* `type` must be `"static-website"` for a static website project type.
* `projectId` 
* `bucketId` 
* `website` is optional and only useful if a [Custom Domain](#custom-domain) has been setup. 

# This Is What We re Up To
We are Neap, an Australian Technology consultancy powering the startup ecosystem in Sydney. We simply love building Tech and also meeting new people, so don't hesitate to connect with us at [https://neap.co](https://neap.co).

Our other open-sourced projects:
#### GraphQL
* [__*graphql-s2s*__](https://github.com/nicolasdao/graphql-s2s): Add GraphQL Schema support for type inheritance, generic typing, metadata decoration. Transpile the enriched GraphQL string schema into the standard string schema understood by graphql.js and the Apollo server client.
* [__*schemaglue*__](https://github.com/nicolasdao/schemaglue): Naturally breaks down your monolithic graphql schema into bits and pieces and then glue them back together.
* [__*graphql-authorize*__](https://github.com/nicolasdao/graphql-authorize.git): Authorization middleware for [graphql-serverless](https://github.com/nicolasdao/graphql-serverless). Add inline authorization straight into your GraphQl schema to restrict access to certain fields based on your user's rights.

#### React & React Native
* [__*react-native-game-engine*__](https://github.com/bberak/react-native-game-engine): A lightweight game engine for react native.
* [__*react-native-game-engine-handbook*__](https://github.com/bberak/react-native-game-engine-handbook): A React Native app showcasing some examples using react-native-game-engine.

#### General Purposes
* [__*core-async*__](https://github.com/nicolasdao/core-async): JS implementation of the Clojure core.async library aimed at implementing CSP (Concurrent Sequential Process) programming style. Designed to be used with the npm package 'co'.
* [__*jwt-pwd*__](https://github.com/nicolasdao/jwt-pwd): Tiny encryption helper to manage JWT tokens and encrypt and validate passwords using methods such as md5, sha1, sha256, sha512, ripemd160.

#### Google Cloud Platform
* [__*google-cloud-bucket*__](https://github.com/nicolasdao/google-cloud-bucket): Nodejs package to manage Google Cloud Buckets and perform CRUD operations against them.
* [__*google-cloud-bigquery*__](https://github.com/nicolasdao/google-cloud-bigquery): Nodejs package to manage Google Cloud BigQuery datasets, and tables and perform CRUD operations against them.
* [__*google-cloud-tasks*__](https://github.com/nicolasdao/google-cloud-tasks): Nodejs package to push tasks to Google Cloud Tasks. Include pushing batches.

# License

BSD 3-Clause License

Copyright (c) 2019, Neap Pty Ltd
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

<p align="center"><a href="https://neap.co" target="_blank"><img src="https://neap.co/img/neap_color_horizontal.png" alt="Neap Pty Ltd logo" title="Neap" height="89" width="200"/></a></p>

