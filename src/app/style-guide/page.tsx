'use client';

import { useState } from 'react';
import { theme } from '@/lib/theme/theme';
import {
  Heading, Text, Mono,
  Container, Stack, Row, Grid, Divider,
  Button, Link, Tag, Card,
  Input, Textarea, Select, Checkbox, Radio, FormField,
  Alert, Spinner, ToastProvider, useToast, Modal,
  Nav, NavBrand, NavLinks, Footer,
} from '@/components';
import * as S from './page.styles';

function ToastDemo() {
  const { notify } = useToast();
  return (
    <Row $gap="sm" $wrap>
      <Button size="sm" onClick={() => notify('Saved to catalog', 'success')}>Success toast</Button>
      <Button size="sm" variant="secondary" onClick={() => notify('Upload failed', 'error')}>Error toast</Button>
      <Button size="sm" variant="ghost" onClick={() => notify('Heads up', 'info')}>Info toast</Button>
    </Row>
  );
}

export default function StyleGuidePage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ToastProvider>
      <S.Page>
        <S.Header>
          <S.Kicker>Human Services · Style Guide</S.Kicker>
          <Heading as="h1" $level={1}>Component Library</Heading>
          <Text $variant="muted">Every element. Dark theme. Assemble pages from these.</Text>
        </S.Header>

        <S.Block>
          <S.BlockTitle>Color</S.BlockTitle>
          <Grid $min="120px">
            {Object.entries(theme.colors).map(([name, value]) => (
              <div key={name}>
                <S.Swatch $color={value} />
                <S.SwatchLabel>{name} {value}</S.SwatchLabel>
              </div>
            ))}
          </Grid>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Typography</S.BlockTitle>
          <Stack $gap="md">
            <Heading as="h1" $level={1}>Heading level 1</Heading>
            <Heading $level={2}>Heading level 2</Heading>
            <Heading $level={3}>Heading level 3</Heading>
            <Heading $level={4}>Heading level 4</Heading>
            <Text>Body text in Space Grotesk — the sleek, modern voice for prose.</Text>
            <Text $variant="muted">Muted body text for secondary copy.</Text>
            <Text $variant="small">Small body text.</Text>
            <Mono>MONO_LABEL · 001 · the old-internet terminal voice</Mono>
          </Stack>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Buttons</S.BlockTitle>
          <Stack $gap="md">
            <Row $gap="sm" $wrap>
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled>Disabled</Button>
              <Button loading>Loading</Button>
            </Row>
            <Row $gap="sm" $wrap>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Text><Link href="#buttons">An inline link</Link> lives in the mono voice.</Text>
          </Stack>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Tags</S.BlockTitle>
          <Row $gap="sm" $wrap>
            <Tag>Default</Tag>
            <Tag $tone="accent">Accent</Tag>
            <Tag $tone="success">Live</Tag>
            <Tag $tone="error">Error</Tag>
            <Tag $tone="warning">Draft</Tag>
            <Tag $tone="info">Info</Tag>
          </Row>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Cards</S.BlockTitle>
          <Grid $min="240px">
            <Card>
              <Stack $gap="sm">
                <Tag $tone="accent">Release</Tag>
                <Heading $level={3}>Static card</Heading>
                <Text $variant="muted">A surface for grouped content.</Text>
              </Stack>
            </Card>
            <Card $interactive>
              <Stack $gap="sm">
                <Tag>Hover me</Tag>
                <Heading $level={3}>Interactive card</Heading>
                <Text $variant="muted">Lifts and borders on hover.</Text>
              </Stack>
            </Card>
          </Grid>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Forms</S.BlockTitle>
          <Container $max="480px" style={{ paddingInline: 0 }}>
            <Stack $gap="lg">
              <FormField label="Artist name" htmlFor="sg-name" hint="Shown on releases">
                <Input id="sg-name" placeholder="e.g. Human Records" />
              </FormField>
              <FormField label="Bio" htmlFor="sg-bio">
                <Textarea id="sg-bio" placeholder="Tell us about the project" />
              </FormField>
              <FormField label="Genre" htmlFor="sg-genre">
                <Select id="sg-genre" defaultValue="">
                  <option value="" disabled>Select one…</option>
                  <option value="electronic">Electronic</option>
                  <option value="ambient">Ambient</option>
                </Select>
              </FormField>
              <FormField label="Invite code" htmlFor="sg-invite" error="This code is invalid">
                <Input id="sg-invite" $invalid defaultValue="XXXX" />
              </FormField>
              <Row $gap="sm">
                <label><Checkbox defaultChecked /> <Mono>Terms</Mono></label>
                <label><Radio name="sg-tier" defaultChecked /> <Mono>Artist</Mono></label>
                <label><Radio name="sg-tier" /> <Mono>Label</Mono></label>
              </Row>
            </Stack>
          </Container>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Feedback</S.BlockTitle>
          <Stack $gap="md">
            <Alert $tone="success">Release published.</Alert>
            <Alert $tone="error">Upload failed — try again.</Alert>
            <Alert $tone="warning">Draft not yet submitted.</Alert>
            <Alert $tone="info">Invites are limited this month.</Alert>
            <Row $gap="sm"><Spinner /> <Mono>Loading…</Mono></Row>
            <ToastDemo />
            <Row><Button onClick={() => setModalOpen(true)}>Open modal</Button></Row>
          </Stack>
        </S.Block>

        <S.Block>
          <S.BlockTitle>Navigation</S.BlockTitle>
          <Stack $gap="lg">
            <Nav>
              <NavBrand>Human Records</NavBrand>
              <NavLinks>
                <Link href="#">Catalog</Link>
                <Link href="#">Artists</Link>
                <Link href="#">Dashboard</Link>
              </NavLinks>
            </Nav>
            <Footer>© Human Records — Access by invitation</Footer>
          </Stack>
        </S.Block>

        <Divider />

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} label="Example modal">
          <Stack $gap="md">
            <Heading $level={3}>Modal title</Heading>
            <Text $variant="muted">Escape, overlay click, or the button closes this.</Text>
            <Row $justify="flex-end"><Button onClick={() => setModalOpen(false)}>Close</Button></Row>
          </Stack>
        </Modal>
      </S.Page>
    </ToastProvider>
  );
}
