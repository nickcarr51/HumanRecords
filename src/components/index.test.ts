import { describe, expect, it } from 'vitest';
import * as UI from './index';

describe('component barrel', () => {
  it('re-exports the core components', () => {
    [
      'Heading', 'Text', 'Mono',
      'Container', 'Section', 'Stack', 'Row', 'Grid', 'Divider',
      'Button', 'Link', 'Tag', 'Card',
      'Input', 'Textarea', 'Select', 'Checkbox', 'Radio', 'FormField',
      'Alert', 'Spinner', 'ToastProvider', 'useToast', 'Modal',
      'Nav', 'NavBrand', 'NavLinks', 'Footer',
    ].forEach((name) => {
      expect(UI[name as keyof typeof UI]).toBeDefined();
    });
  });
});
