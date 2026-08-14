import { Module } from '@nestjs/common';
import { MediaStorage } from './media-storage';
import { MediaController } from './media.controller';

@Module({ providers: [MediaStorage], controllers: [MediaController], exports: [MediaStorage] })
export class MediaModule {}
