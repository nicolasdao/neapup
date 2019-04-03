# Install

```js
npm run insta
```

This command will pull the latest changes from git, and re-install neapup globally. 

# How To Use Me
## Basics

Create a web app or a static website the way you've always done it and then run:

```
neap up
```

This command prompts to answer a few questions and there you go! Your answers are stored in an `app.json` in your root folder so that the next deployment is even faster. 

## Static Website
### Overview - Setting Up a Bucket as a Static Website

Though a Google Cloud Bucket can be used to host a static website, a few configurations must be applied to it beforehand:

1. The bucket must be public.
2. The bucket name must represent a domain name (e.g., your-domain.com). This step is the only way to set up a custom domain.

The first setup is trivial and is automatically taken care of by `neapup`. The second one is not required to host a static website, but is recommended. Indeed, skipping the second step means that the static website is available at [https://storage.googleapis.com/your-bucket-id](https://storage.googleapis.com/your-bucket-id) rather than [https://your-custom-domain.com](https://your-custom-domain.com). This seems harmless, but this means that the web resources (i.e., js, css, images, ...) cannot use a path relative to the domain. Indeed, skipping step 2 means the static website's domain is storage.googleapis.com. A resource relative to the domain would look like [https://storage.googleapis.com/media/css/style.css](https://storage.googleapis.com/media/css/style.css), which would be not found. That's why we recommend to setup a custom domain. For more details, refer to section the [Custom Domain](#custom-domain). 

### Configuration
#### Custom Domain



#### `app.json`

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

