import { getPublicDeployment } from '@/lib/deployments/engine';
import { publicError, publicGatewayUrl, publicJson, publicOptions, publicOrigin } from '@/lib/public-agent/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ publicId: string }> };
export async function GET(request: Request, context: Context) {
  try { const { publicId } = await context.params, origin = publicOrigin(request); return publicJson({ deployment: await getPublicDeployment(publicId, origin), voiceGatewayUrl: publicGatewayUrl() }, origin); } catch (error) { return publicError(error); }
}
export async function OPTIONS(request: Request, context: Context) { return publicOptions(request, (await context.params).publicId); }
