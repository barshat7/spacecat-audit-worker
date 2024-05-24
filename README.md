# Spacecat Content Scraper

This is a simple web scraper that scrapes content from a given URL and stores it in a JSON file on AWS S3.
After storing the content, it sends a message to an SQS queue with the S3 location of the page that was scraped.

Optionally a slack context can be provided to send a message to a slack channel with status updates.

## How it Works

The project is deployed as an AWS Lambda function that is triggered by an SQS message. 
The message contains the URL of the page to scrape. 
The function uses a headless chromium browser to scrape the content and uses puppeteer to interact with the browser.
Puppeteer uses the puppeteer-extra-plugin-stealth plugin to avoid bot-detection by websites.
The content is then stored in a JSON file on an S3 bucket.


## Configuration
The following environment variables are required to run the scraper:

```json
{
    "AWS_REGION": "us-east-1",
    "S3_BUCKET_NAME": "s3-bucket-where-scrape-results-are-stored",
    "SCRAPING_JOBS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/1234/queue-name-that-triggers-the-scraper",
    "SLACK_OPS_CHANNEL_WORKSPACE_INTERNAL": "channel-id-of-the-slack-channel-to-send-status-updates",
    "SLACK_TOKEN_WORKSPACE_INTERNAL": "slack-token"
}
```

## AWS Layers
The following dependencies are included in the AWS Lambda function as layers:
- Puppeteer (layer: `spacecat-puppeteer`)
  - puppeteer-core
  - puppeteer-extra
  - puppeteer-extra-plugin-stealth
- Chromium (layer: `spacecat-chrome-aws-lambda`)
  - @sparticuz/chromium

Puppeteer is included as a layer due to issues building the function with `helix-deploy` resulting in webpack build failures.

Chromium is platform-specific and is included as a layer to avoid the need to build the function for each platform or provide a custom docker image.

### Chromium Layer
The latest release can be downloaded from the [releases page](https://github.com/Sparticuz/chromium/releases) and uploaded to AWS as a layer.

The puppeteer version must match the version of chromium used. You can see which puppeteer version is compatible with which chromium version [here](https://pptr.dev/supported-browsers).
If you update the chromium version, you must also update the puppeteer version in the `package.json` file as well as the `puppeteer` layer.

### Puppeteer Layer
The puppeteer layer is built using the `puppeteer-core` package to avoid downloading the chromium binary. The `puppeteer-extra` and `puppeteer-extra-plugin-stealth` packages are also included in the layer.
The layer is built using the following command:
```bash
npm run build:layer
```
This will create a `dist/spacecat-layer-puppeteer.zip` file that can be uploaded to AWS as a layer.

For mor information on how to create layers see the [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html).

### Deploying layers
Layer ZIP files are hosted on the `spacecat-layers` S3 bucket (`arn:aws:s3:::spacecat-layers`).
When updating the layers, the ZIP files must be uploaded to the S3 bucket and the ZIP file S3 URIs must be updated in the 
layer configurations on [AWS console](https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/layers).
To update the layer, edit it and hit "Create Version" and reference the new ZIP file via "Upload a file from Amazon S3".
Make sure to selected the correct runtime for the layer (Node.js 20 at the time of writing) and set the platform to `x86_64`.

