import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  RenderRequest,
  RenderResponse,
  RendererController as IRendererController,
} from '../proto/sitegap/renderer/v1/renderer';

@Controller()
export class RenderController implements IRendererController {
  @GrpcMethod('Renderer', 'Render')
  render(_request: RenderRequest): RenderResponse {
    throw new RpcException({
      code: status.UNIMPLEMENTED,
      message: 'Render is not implemented yet',
    });
  }
}
