import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "https://esm.sh/@aws-sdk/client-s3@3.620.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.620.0";

function client(): S3Client {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 env not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const BUCKET = () => Deno.env.get("R2_BUCKET") ?? "advance-seeds-models";

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET(), Key: key }),
    { expiresIn },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}

export async function presignPut(
  key: string,
  contentType = "application/octet-stream",
  expiresIn = 900,
): Promise<string> {
  return await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}
