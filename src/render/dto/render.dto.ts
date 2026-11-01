import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { RenderRequest } from '../../proto/sitegap/renderer/v1/renderer';

export class RenderDto implements RenderRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
  })
  url!: string;
}
