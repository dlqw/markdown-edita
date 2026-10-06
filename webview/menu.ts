export interface MenuOption {
  value: string;
  label: string;
  description?: string;
  swatch?: string;
}

export interface ContextMenu {
  open(
    title: string,
    options: MenuOption[],
    current: string,
    x: number,
    y: number,
    pick: (value: string) => void,
  ): void;
  close(): void;
}

const MENU_MARGIN = 8;

export function createContextMenu(root: HTMLElement, onClose: () => void): ContextMenu {
  const container = document.createElement('div');
  container.id = 'markdown-edita-menu';
  container.tabIndex = -1;
  container.hidden = true;
  const title = document.createElement('div');
  title.className = 'markdown-edita-menu-title';
  const list = document.createElement('div');
  list.className = 'markdown-edita-menu-list';
  container.append(title, list);
  root.append(container);

  let pickValue: ((value: string) => void) | undefined;
  let items: HTMLElement[] = [];
  let active = -1;

  const setActive = (index: number): void => {
    items.forEach((item, position) => {
      item.dataset.active = position === index ? 'true' : 'false';
    });
    active = index;
  };

  const close = (): void => {
    if (container.hidden) {
      return;
    }
    container.hidden = true;
    pickValue = undefined;
    items = [];
    active = -1;
    container.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onPointerDown, true);
    onClose();
  };

  const commit = (index: number): void => {
    const value = items[index]?.dataset.value;
    const handler = pickValue;
    if (value === undefined || handler === undefined) {
      return;
    }
    close();
    handler(value);
  };

  const move = (step: number): void => {
    if (items.length === 0) {
      return;
    }
    if (active < 0) {
      setActive(step < 0 ? items.length - 1 : 0);
      return;
    }
    setActive((active + step + items.length) % items.length);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActive(items.length === 0 ? -1 : 0);
        break;
      case 'End':
        event.preventDefault();
        setActive(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(active);
        break;
      default:
        break;
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node) || !container.contains(target)) {
      close();
    }
  };

  return {
    open(heading, options, current, x, y, pick): void {
      title.textContent = heading;
      list.replaceChildren();
      items = options.map((option, index) => {
        const item = document.createElement('div');
        item.className = 'markdown-edita-menu-item';
        item.dataset.value = option.value;
        if (option.swatch !== undefined) {
          const swatch = document.createElement('span');
          swatch.className = 'markdown-edita-menu-swatch';
          swatch.style.background = option.swatch;
          item.append(swatch);
        }
        const label = document.createElement('span');
        label.className = 'markdown-edita-menu-label';
        label.textContent = option.label;
        item.append(label);
        if (option.description !== undefined) {
          const note = document.createElement('span');
          note.className = 'markdown-edita-menu-note';
          note.textContent = option.description;
          item.append(note);
        }
        const check = document.createElement('span');
        check.className = 'markdown-edita-menu-check';
        check.textContent = option.value === current ? '✓' : '';
        item.append(check);
        item.addEventListener('pointerenter', () => setActive(index));
        item.addEventListener('click', () => commit(index));
        list.append(item);
        return item;
      });
      pickValue = pick;
      container.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      container.hidden = false;
      const bounds = container.getBoundingClientRect();
      container.style.left = `${Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - bounds.width - MENU_MARGIN))}px`;
      container.style.top = `${Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - bounds.height - MENU_MARGIN))}px`;
      setActive(items.findIndex((item) => item.dataset.value === current));
      container.addEventListener('keydown', onKeyDown);
      document.addEventListener('pointerdown', onPointerDown, true);
      container.focus();
    },
    close,
  };
}
