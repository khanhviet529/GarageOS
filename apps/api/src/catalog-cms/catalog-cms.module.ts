import { Module } from '@nestjs/common';
import { CatalogCmsController } from './catalog-cms.controller';
@Module({ controllers: [CatalogCmsController] })
export class CatalogCmsModule {}
