import { Module } from '@nestjs/common';
import { ArticleService } from './article.service';
import { ArticleController } from './article.controller';
import { NavigationController } from './navigation.controller';

@Module({ providers: [ArticleService], controllers: [ArticleController, NavigationController], exports: [ArticleService] })
export class ArticleModule {}
