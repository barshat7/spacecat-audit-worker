# Spacecat Content Scraper

This is a versatile web scraper that scrapes content from a given URL, processes it using specific handlers, and stores the result on AWS S3 in a format specified by the handler. After storing the content, it sends a message to an SQS queue with the S3 location of the page that was scraped. Optionally, a Slack context can be provided to send a message to a Slack channel with status updates.

## How it Works

The project is deployed as an AWS Lambda function triggered by an SQS message. The message contains the URL of the page to scrape and additional metadata required for processing. The function uses a headless Chromium browser to scrape the content, leveraging Puppeteer to interact with the browser. Puppeteer uses the `puppeteer-extra-plugin-stealth` plugin to avoid bot detection by websites. The content is then processed by specific handlers, which encapsulate the logic for different types of tasks, and stored in a JSON file on an S3 bucket.

### Incoming SQS Message Format

The SQS message that triggers the AWS Lambda function must adhere to the following JSON structure:

```json
{
  "processingType": "import",
  "jobId": "75c2c9be-9751-4635-bba6-92b3beda707d",
  "options": {
    "pageLoadTimeout": 100,
    "enableJavaScript": true,
    "saveAsDocx": true
  },
  "urls": [
    {
      "url": "https://www.example.com/page1",  
      "urlId": "8697cda0-af31-4933-93c8-80d1b88272ba",
      "status": "pending"
    }
  ]
}
```

#### Fields

- **processingType**: A string that indicates the type of processing to be performed. This field is used to select the appropriate handler. Example values: `"import"`, `"export"`.
- **jobId**: A unique identifier for the job. This is a string, typically a UUID.
- **options**: An object containing various options for processing. These options can be used to customize the behavior of the scraping process.
  - **pageLoadTimeout**: (Optional) A number specifying the timeout in milliseconds to allow for the DOM to be decorated by client side JavaScript. Default is `100` milliseconds.
  - **enableJavaScript**: (Optional) A boolean indicating whether JavaScript should be enabled in the browser context. Default is `true`.
  - **saveAsDocx**: (Optional) A boolean indicating whether the scraped result should be saved as a DOCX file. Default is `false`.
- **urls**: An array of URL objects to be processed. Only the first URL in the array will be processed.
  - **url**: A string representing the URL to be scraped. This is a required field.
  - **urlId**: (Optional) A unique identifier for the URL. This is a string, typically a UUID.
  - **status**: (Optional) A string representing the status of the URL. Example value: `"pending"`.

#### Notes

- The **urls** array must contain at least one URL object.
- The Lambda function will process only the first URL in the **urls** array.
- The **processingType** field is crucial for selecting the appropriate handler to process the job. Ensure that it matches one of the handler types implemented in your project.

### Handler Concept and Implementation

In our system, handlers are responsible for processing specific types of tasks. Each handler encapsulates the logic necessary to handle a particular processing type, such as scraping web pages or processing data. Handlers inherit from a common `AbstractHandler` class, which provides shared functionality and enforces a consistent structure across all handlers.

#### AbstractHandler

The `AbstractHandler` class serves as the base class for all handlers. It provides essential methods and properties that facilitate common tasks such as logging, configuration validation, web scraping, and error handling. By extending the `AbstractHandler`, concrete handlers can focus on implementing task-specific logic while leveraging the shared functionality provided by the base class.

##### Key Features of AbstractHandler

- **Configuration Validation:** Ensures that the necessary configuration fields are present and correctly formatted.
- **Service Validation:** Checks that the required services (`sqsClient` and `s3Client`) are provided.
- **Logging:** Centralized logging method that includes the handler name for consistent and informative log messages.
- **Web Scraping:** Uses Puppeteer to perform web scraping tasks, with support for device emulation and script injection.
- **Error Handling:** Handles processing errors by logging them and sending notifications via Slack.
- **Storage:** Stores scraping results in S3 and logs the storage process.

### Example Implementation: ExperimentationCandidatesDesktopHandler

Below is a trivial example implementation of a handler that extends the `AbstractHandler`:

```javascript
import AbstractHandler from './abstract-handler.js';

class ExperimentationCandidatesDesktopHandler extends AbstractHandler {
  static handlerName = 'experimentation-candidates-desktop';

  constructor(config, services) {
    super(
      ExperimentationCandidatesDesktopHandler.handlerName,
      config,
      services,
    );
  }

  static accepts(processingType) {
    return processingType === ExperimentationCandidatesDesktopHandler.handlerName;
  }
}

export default ExperimentationCandidatesDesktopHandler;
```

### How to Create a New Handler

To create a new handler, follow these steps:

1. **Create a New Class:**
  - Define a new class that extends `AbstractHandler`.

2. **Define the Handler Name:**
  - Add a static property `handlerName` to uniquely identify the handler.

3. **Implement the Constructor:**
  - In the constructor, call the parent class constructor with the handler name, configuration, and services.

4. **Implement the `accepts` Method:**
  - Define a static method `accepts` that checks if the handler can process the given task type.

### Example

Here is a trivial example implementation of a handler named `SampleHandler`:

```javascript
import AbstractHandler from './abstract-handler.js';

class SampleHandler extends AbstractHandler {
  static handlerName = 'sample-handler';

  constructor(config, services) {
    super(
      SampleHandler.handlerName,
      config,
      services,
    );
  }

  static accepts(processingType) {
    return processingType === SampleHandler.handlerName;
  }
}

export default SampleHandler;
```

This example demonstrates how to extend the `AbstractHandler` class and implement the necessary methods to create a new handler. By following this pattern, you can easily add new handlers to the system to process different types of tasks.

## AWS Layers
The following dependencies are included in the AWS Lambda function as layers:
- Puppeteer (layer: `spacecat-puppeteer`)
  - puppeteer-core
  - puppeteer-extra
  - puppeteer-extra-plugin-stealth
- Chromium (layer: `spacecat-chrome-aws-lambda`)
  - @sparticuz/chromium
- Sharp Layer (layer: `spacecat-sharp-layer`)
  - sharp

Puppeteer is included as a layer due to issues building the function with `helix-deploy` resulting in webpack build failures.

Chromium is platform-specific and is included as a layer to avoid the need to build the function for each platform or provide a custom docker image.

Sharp is a dependency of the importer handler for image processing.

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

### Sharp Layer
The latest version of sharp can be downloaded from the [releases page](https://github.com/pH200/sharp-layer).

For mor information on how to create layers see the [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html).

### Deploying layers
Layer ZIP files are hosted on the `spacecat-layers` S3 bucket (`arn:aws:s3:::spacecat-layers`).
When updating the layers, the ZIP files must be uploaded to the S3 bucket and the ZIP file S3 URIs must be updated in the 
layer configurations on [AWS console](https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/layers).
To update the layer, edit it and hit "Create Version" and reference the new ZIP file via "Upload a file from Amazon S3".
Make sure to selected the correct runtime for the layer (Node.js 20 at the time of writing) and set the platform to `x86_64`.

## Configuration

To configure the scraper, several environment variables and configurations must be provided. These configurations ensure that the scraper can connect to necessary services and handle tasks correctly.

### Required Environment Variables

- **SLACK_OPS_CHANNEL_WORKSPACE_INTERNAL**: The Slack channel ID where status updates will be sent.
- **SLACK_TOKEN_WORKSPACE_INTERNAL**: The slack token.
- **HANDLER_CONFIGS**: A JSON string containing configuration for each handler.
- **SLACK_WEBHOOK_URL**: The webhook URL to send notifications to Slack.

### Handler Configuration

Each handler requires specific configuration fields, which should be stored in the `HANDLER_CONFIGS` environment variable. Below is an example configuration for a handler:

```json
{
  "experimentation-candidates-desktop": {
    "completionQueueUrl": "https://sqs.us-east-1.amazonaws.com/123456789012/completion-queue",
    "s3BucketName": "my-scraping-bucket"
  }
}
```

### Configuration Fields

- **s3BucketName**: The name of the S3 bucket where scraped content will be stored.
- **completionQueueUrl**: The URL of the SQS queue where a completion message will be sent after processing.
