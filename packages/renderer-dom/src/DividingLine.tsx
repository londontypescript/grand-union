import type { ReactElement } from 'react';

// `DividingLineProps` carries no fields, so this implementation omits the
// parameter entirely — assignable to `(props: DividingLineProps) => ReactNode`
// by ordinary function contravariance, with no unused parameter to name.
export function DividingLine(): ReactElement {
  return <hr className="lts-divider" />;
}
