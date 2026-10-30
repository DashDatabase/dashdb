'use client';

import {
  Badge,
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Kbd,
  KbdGroup,
  Logo,
  LogoMark,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@dashdb/ui';
import {
  DatabaseIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  TableIcon,
  Trash2Icon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

const swatches = [
  { name: 'background', className: 'bg-background' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-raised', className: 'bg-surface-raised' },
  { name: 'border', className: 'bg-border' },
  { name: 'highlight', className: 'bg-highlight' },
  { name: 'text', className: 'bg-text' },
  { name: 'text-muted', className: 'bg-text-muted' },
  { name: 'primary', className: 'bg-primary' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'danger', className: 'bg-danger' },
] as const;

const tables = [
  'accounts',
  'audit_log',
  'categories',
  'invoices',
  'invoice_items',
  'items',
  'memberships',
  'orders',
  'order_items',
  'payments',
  'projects',
  'sessions',
  'subscriptions',
  'users',
];

export function TokenSwatches() {
  return (
    <section aria-labelledby="tokens" className="space-y-4">
      <h2 id="tokens" className="text-xl font-semibold">
        Tokens
      </h2>
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} className={`${theme} rounded-lg border bg-background p-4`}>
          <p className="mb-3 text-sm font-medium capitalize">{theme}</p>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {swatches.map((swatch) => (
              <li key={swatch.name} className="space-y-1.5">
                <div className={`h-10 rounded-md border shadow-xs ${swatch.className}`} />
                <p className="font-mono text-xs text-text-muted">{swatch.name}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-text-muted">{title}</h3>
      {children}
    </div>
  );
}

export function Showcase() {
  const id = useId();
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <div className="space-y-8">
      <Section title="Brand">
        <div className="flex items-center gap-6">
          <Logo />
          <LogoMark />
          <LogoMark className="size-5" />
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <p className="text-2xl font-semibold tracking-tight">Schema, diffed and migrated.</p>
          <p className="text-sm text-text-muted">
            Inter for the interface. JetBrains Mono for code and identifiers.
          </p>
          <pre className="overflow-x-auto rounded-md border bg-surface p-3 font-mono text-xs">
            <code>{"ALTER TABLE users ADD COLUMN plan text NOT NULL DEFAULT 'free';"}</code>
          </pre>
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">
            <Trash2Icon aria-hidden /> Drop
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>
            <Loader2Icon className="animate-spin" aria-hidden /> Connecting
          </Button>
          <Button size="icon" variant="outline" aria-label="Add table">
            <PlusIcon aria-hidden />
          </Button>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge>Primary</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">Applied</Badge>
          <Badge variant="warning">Locks table</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              Connection name
            </label>
            <Input id={`${id}-name`} placeholder="production-replica" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-invalid`} className="text-sm font-medium">
              Port
            </label>
            <Input id={`${id}-invalid`} defaultValue="54321x" aria-invalid />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-dialect`} className="text-sm font-medium">
              Dialect
            </label>
            <Select defaultValue="postgres">
              <SelectTrigger id={`${id}-dialect`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="sqlite">SQLite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 self-end pb-2">
            <Switch id={`${id}-ssl`} defaultChecked />
            <label htmlFor={`${id}-ssl`} className="text-sm font-medium">
              Require SSL
            </label>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-notes`} className="text-sm font-medium">
              Notes
            </label>
            <Textarea id={`${id}-notes`} placeholder="Read-only replica, refreshed nightly." />
          </div>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="sql">
          <TabsList>
            <TabsTrigger value="sql">SQL</TabsTrigger>
            <TabsTrigger value="prisma">Prisma</TabsTrigger>
            <TabsTrigger value="drizzle">Drizzle</TabsTrigger>
          </TabsList>
          <TabsContent value="sql" className="text-sm text-text-muted">
            Raw DDL for your dialect.
          </TabsContent>
          <TabsContent value="prisma" className="text-sm text-text-muted">
            A schema.prisma model block.
          </TabsContent>
          <TabsContent value="drizzle" className="text-sm text-text-muted">
            A Drizzle table definition.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Kbd, separator, skeleton">
        <div className="flex items-center gap-4 text-sm">
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-text-muted">Command palette</span>
        </div>
        <Separator />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Section>

      <Section title="Scroll area and resizable">
        <ResizablePanelGroup orientation="horizontal" className="min-h-48 rounded-lg border">
          <ResizablePanel defaultSize="40%" minSize="25%">
            <ScrollArea className="h-48">
              <ul aria-label="Tables" className="p-2">
                {tables.map((table) => (
                  <li key={table}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-highlight"
                    >
                      <TableIcon className="size-3.5 text-text-muted" aria-hidden />
                      {table}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="60%">
            <div className="flex h-full items-center justify-center p-4 text-sm text-text-muted">
              Drag the handle to resize.
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Settings">
                <SettingsIcon aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Settings <Kbd>,</Kbd>
            </TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>users.email</PopoverTitle>
                <PopoverDescription>varchar(255), unique, not null</PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Dropdown</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Table</DropdownMenuLabel>
              <DropdownMenuItem>
                <PlusIcon aria-hidden /> Add column
                <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <KeyRoundIcon aria-hidden /> Add index
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2Icon aria-hidden /> Drop table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Drop table “orders”?</DialogTitle>
                <DialogDescription>
                  This deletes 12,408 rows and two foreign keys. It cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive">Drop table</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Column properties</SheetTitle>
                <SheetDescription>Edit users.email</SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <Button>Save</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            onClick={() => {
              setCommandOpen(true);
            }}
          >
            Command palette
          </Button>
          <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
            <CommandInput placeholder="Search tables and actions…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Tables">
                <CommandItem>
                  <TableIcon aria-hidden /> users
                </CommandItem>
                <CommandItem>
                  <TableIcon aria-hidden /> orders
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </div>

        <ContextMenu>
          <ContextMenuTrigger className="flex h-20 items-center justify-center rounded-lg border border-dashed text-sm text-text-muted">
            Right-click for the context menu
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>
              Copy name <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>Duplicate</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Toast">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast('Schema saved')}>
            Default
          </Button>
          <Button variant="outline" onClick={() => toast.success('Migration applied')}>
            Success
          </Button>
          <Button variant="outline" onClick={() => toast.warning('Migration locks “orders”')}>
            Warning
          </Button>
          <Button variant="outline" onClick={() => toast.error('Connection refused')}>
            Error
          </Button>
        </div>
      </Section>

      <Section title="Command (inline)">
        <Command className="rounded-lg border">
          <CommandInput placeholder="Type a command…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem>
                <DatabaseIcon aria-hidden /> Connect database
                <CommandShortcut>Ctrl+D</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <PlusIcon aria-hidden /> New table
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem>
                <SettingsIcon aria-hidden /> Preferences
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Section>
    </div>
  );
}
