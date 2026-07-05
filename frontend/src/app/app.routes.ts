import { Routes } from '@angular/router';
import { ArticlePage } from './article-page/article-page';
import { EmployeePage } from './employee-page/employee-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  { path: 'artykul/:id', component: ArticlePage },
  { path: 'employee', component: EmployeePage },
  { path: '**', redirectTo: '' },
];
