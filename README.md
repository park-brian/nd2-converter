## Convert .nd2 images to pyramidal .ome.tif images

#### Prerequisites
- S3 bucket configured to provide event notifications to SQS
- Verified SES email domain

##### Example SQS Permissions
- **$SQS_ARN** should be replaced with your SQS queue's ARN
- **$S3_ARN** should be replaced with your S3 bucket's ARN

```json
{
  "Version": "2012-10-17",
  "Id": "$SQS_ARN/SQSDefaultPolicy",
  "Statement": [
    {
      "Sid": "$PERMISSION_ID",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": "SQS:SendMessage",
      "Resource": "$SQS_ARN",
      "Condition": {
        "ArnLike": {
          "aws:SourceArn": "$S3_ARN"
        }
      }
    }
  ]
}
```

##### Example S3 Notification Configuration
- **$S3_ARN** should be replaced with your S3 bucket's ARN

```xml
<NotificationConfiguration>
  <QueueConfiguration>
      <Id>1</Id>
      <Filter>
          <S3Key>
              <FilterRule>
                  <Name>prefix</Name>
                  <Value>input/</Value>
              </FilterRule>
              <FilterRule>
                  <Name>suffix</Name>
                  <Value>.nd2</Value>
              </FilterRule>
          </S3Key>
     </Filter>
     <Queue>$SQS_ARN</Queue>
     <Event>s3:ObjectCreated:*</Event>
  </QueueConfiguration>
</NotificationConfiguration>
```

#### Getting Started

```bash
npm install
```

#### Create Configuration File
```bash
cd server
cp config.example.json config.json
# Update config.json with properties specific to your environment
```

#### Start Worker
```bash
npm run start-worker
```

#### Start Server (Optional)
The server enables users to optionally upload and provide conversion parameters for specific images.
```bash
npm start
# Server runs on port 10000 by default
```
