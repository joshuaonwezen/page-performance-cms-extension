import {Alert, Button, Disclosure, DisclosureContent, DisclosureTrigger, Group, Separator, Text} from '@optiaxiom/react';
import {register, type ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import {isFxAppUrl} from '@shared/constants';
import {DEFAULT_PROFILE} from '@shared/profile';
import {pagePaths} from '@shared/routes';
import type {Ga4Report, PageExperiment, PerformanceResult} from '@shared/types';
import {useCallback, useEffect, useRef, useState} from 'react';

import {call} from '../common/api';
import {Frame} from '../common/Frame';
import {OpenLink} from '../common/OpenLink';
import {ResultsTable} from '../common/ResultsTable';
import {StatusBadge} from '../common/StatusBadge';
import {useContent} from '../common/useContent';
import {BarList, CHART_STYLE, DailyTable, StatTile, TrendChart} from './charts';

const percent = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
const seconds = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);

const TYPE_LABELS: Record<string, string> = {
  'a/b': 'A/B test',
  multi_armed_bandit: 'Multi-armed bandit',
  contextual_multi_armed_bandit: 'Contextual bandit',
};

/** Shown in place of the panel's body when there is no page to report on. */
function NeedsPage({detail}: {detail?: string}) {
  return (
    <Alert intent="information">
      <Text fontSize="sm">Open a page to see how it performs.{detail ? ` ${detail}` : ''}</Text>
    </Alert>
  );
}

function Experiment({experiment}: {experiment: PageExperiment}) {
  const goal = experiment.results?.metric ?? experiment.primaryMetric;
  const details = [
    TYPE_LABELS[experiment.type] ?? 'Experiment',
    experiment.trafficPercent === null ? null : `${experiment.trafficPercent}% of visitors`,
    goal ? `goal: ${goal}` : null,
  ].filter(Boolean);
  return (
    <Group flexDirection="column" gap="8">
      <Group flexDirection="column" gap="2">
        <Group alignItems="center" flexWrap="wrap" gap="8">
          <Text fontSize="sm" fontWeight="600">
            {experiment.ruleName}
          </Text>
          <StatusBadge running={experiment.live} status={experiment.status} />
        </Group>
        <Text color="fg.secondary" fontSize="xs">
          {details.join(' · ')}
        </Text>
      </Group>
      {experiment.results ? (
        <ResultsTable controlKey={DEFAULT_PROFILE.controlKey} results={experiment.results} />
      ) : (
        experiment.resultsNote && (
          <Text color="fg.secondary" fontSize="sm">
            {experiment.resultsNote}
          </Text>
        )
      )}
      <Group flexWrap="wrap" gap="8">
        {isFxAppUrl(experiment.resultsUrl) && (
          <OpenLink size="sm" url={experiment.resultsUrl}>
            Full results in FX
          </OpenLink>
        )}
        {isFxAppUrl(experiment.flagUrl) && (
          <OpenLink appearance="subtle" size="sm" url={experiment.flagUrl}>
            Open in FX
          </OpenLink>
        )}
      </Group>
    </Group>
  );
}

/** Everything about the traffic beyond the page views: folded away so the panel stays short. */
function MoreDetail({report}: {report: Ga4Report}) {
  const [showDays, setShowDays] = useState(false);
  return (
    <Disclosure>
      <DisclosureTrigger>More detail</DisclosureTrigger>
      <DisclosureContent>
        <Group flexDirection="column" gap="12" pt="8">
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12}}>
            <StatTile label="Users" previous={report.previous.users} value={report.totals.users} />
            <StatTile
              format={percent}
              label="Engagement rate"
              previous={report.previous.engagementRate}
              value={report.totals.engagementRate}
            />
            <StatTile
              format={seconds}
              label="Engagement time per user"
              previous={report.previous.engagementSeconds}
              value={report.totals.engagementSeconds}
            />
            <StatTile label="Key events" previous={report.previous.keyEvents} value={report.totals.keyEvents} />
          </div>

          {report.sources.length > 0 && (
            <>
              <Text fontSize="sm" fontWeight="600">Top sources</Text>
              <BarList rows={report.sources.map((s) => ({label: s.name, value: s.views}))} unit="views" />
            </>
          )}

          {report.variants.length > 1 && (
            <>
              <Text fontSize="sm" fontWeight="600">Views by Web Experimentation variation</Text>
              <BarList
                rows={report.variants.map((v) => ({label: v.variant === 'base' ? 'Original page' : v.variant, value: v.views}))}
                unit="views"
              />
            </>
          )}

          <Button appearance="subtle" onClick={() => setShowDays((v) => !v)} size="sm">
            {showDays ? 'Hide views per day' : 'Show views per day as a table'}
          </Button>
          {showDays && <DailyTable points={report.daily} />}
        </Group>
      </DisclosureContent>
    </Disclosure>
  );
}

function Performance({context}: {context: ExtensionContext}) {
  const {content, ready} = useContent(context);
  const [result, setResult] = useState<PerformanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Whether GA4 is set up, kept across pages so the subtitle doesn't flicker on each load.
  const [hasGa4, setHasGa4] = useState(false);
  const requestId = useRef(0);

  const path = content?.path ?? null;
  const locale = content?.locale ?? 'en';

  const load = useCallback(
    async (forPath: string, forLocale: string) => {
      const id = ++requestId.current;
      setBusy(true);
      try {
        const next = await call(context, 'performance', {path: forPath, locale: forLocale});
        if (id !== requestId.current) return;
        setResult(next);
        setHasGa4(next.ga4 !== null);
        setError(null);
      } catch (e) {
        if (id === requestId.current) setError(e);
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    },
    [context],
  );

  useEffect(() => {
    // A new page: drop the previous page's numbers, and any answer still on its way for it.
    setResult(null);
    setError(null);
    if (path) {
      void load(path, locale);
    } else {
      requestId.current++;
      setBusy(false);
    }
  }, [path, locale, load]);

  const reload = path ? () => void load(path, locale) : undefined;
  const subtitle = path ? `${hasGa4 ? 'Last 28 days · ' : ''}${pagePaths(path, locale).join(' and ')}` : undefined;

  if (!ready) return <Frame busy />;
  if (!content) {
    return (
      <Frame>
        <NeedsPage />
      </Frame>
    );
  }
  if (!path) {
    return (
      <Frame>
        <NeedsPage detail="Blocks, images and folders have no URL on the site." />
      </Frame>
    );
  }

  const report = result?.ga4?.ok ? result.ga4.report : null;
  const experiments = result?.experiments ?? [];

  return (
    <Frame busy={busy} error={error} onRetry={reload} subtitle={subtitle}>
      <style>{CHART_STYLE}</style>
      {result && (
        // Refetch keeps the frame: the previous render stays, dimmed, until new data lands.
        <div className="viz-root" style={{opacity: busy ? 0.6 : 1, transition: 'opacity 120ms'}}>
          <Group flexDirection="column" gap="12">
            <Group justifyContent="end">
              <Button appearance="subtle" disabled={busy} onClick={reload} size="sm">
                Refresh
              </Button>
            </Group>

            {result.ga4 && !result.ga4.ok && (
              <Alert intent="warning">
                <Text fontSize="sm">{result.ga4.error}</Text>
              </Alert>
            )}
            {report && (
              <>
                <StatTile label="Page views" previous={report.previous.views} value={report.totals.views} />
                {report.totals.views === 0 ? (
                  <Text color="fg.secondary" fontSize="sm">
                    Google Analytics recorded no views of this page in the last 28 days.
                  </Text>
                ) : (
                  <TrendChart points={report.daily} />
                )}
                {experiments.length > 0 && (
                  <Text color="fg.tertiary" fontSize="xs">
                    These views include every experiment variation: they share the page&apos;s URL, so Google Analytics can&apos;t
                    tell them apart. The experiment results below can.
                  </Text>
                )}
              </>
            )}

            {result.fxConfigured && (
              <>
                {report && <Separator />}
                <Text fontSize="sm" fontWeight="600">Experiments on this page</Text>
                {result.experimentsError ? (
                  <Alert intent="warning">
                    <Text fontSize="sm">{result.experimentsError}</Text>
                  </Alert>
                ) : (
                  experiments.length === 0 && (
                    <Text color="fg.secondary" fontSize="sm">
                      No experiment targets this page.
                    </Text>
                  )
                )}
                {experiments.map((e) => (
                  <Experiment experiment={e} key={`${e.flagKey}:${e.ruleKey}`} />
                ))}
              </>
            )}

            {report && report.totals.views > 0 && (
              <>
                <Separator />
                <MoreDetail report={report} />
              </>
            )}
          </Group>
        </div>
      )}
    </Frame>
  );
}

register((context) => <Performance context={context} />);
