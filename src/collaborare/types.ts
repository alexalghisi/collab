export type CatalogKind = 'problem' | 'announcement';

export interface CatalogItem {
  readonly kind: CatalogKind;
  readonly slug: string;
  readonly title: string;
  readonly category: string;
  readonly topic: string;
  readonly difficulty: number;
  readonly limits: string;
  readonly statement: string;
  readonly starter: string;
  readonly url: string;
}

export interface Catalog {
  readonly source: string;
  readonly items: readonly CatalogItem[];
}

export interface CatalogQuery {
  readonly text: string;
  readonly kind: 'all' | CatalogKind;
  readonly category: string;
}
