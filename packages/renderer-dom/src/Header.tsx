import type { ReactElement } from 'react';
import type { HeaderProps } from '@lts/vocabulary';

export function Header({ children }: HeaderProps): ReactElement {
  return <h1 className="lts-header">{children}</h1>;
}
