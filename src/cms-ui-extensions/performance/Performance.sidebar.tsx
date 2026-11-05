import {Alert, Badge, Button, Group, Separator, Text} from '@optiaxiom/react';
import {register, type ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import type {PageExperiment, PerformanceResult} from '@shared/types';
import {useCallback, useEffect, useRef, useState} from 'react';

import {call} from '../common/api';
import {Frame, NeedsPage} from '../common/Frame';
import {OpenLink} from '../common/OpenLink';
import {useContent} from '../common/useContent';
import {BarList, CHART_STYLE, compact, StatTile, TrendChart} from './charts';

const percent = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
const seconds = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);

const TYPE_LABELS: Record<string, string> = {
  'a/b': 'A/B test',
  multi_armed_bandit: 'Multi-armed bandit',
  contextual_multi_armed_bandit: 'Contextual bandit',
};

function Experiment({experiment}: {experiment: PageExperiment}) {
  const {results} = experiment;
  return (
    <Group flexDirection="column" gap="4">
      <Group alignItems="center" flexWrap="wrap" gap="8">
        <Text fontSize="sm" fontWeight="600">
          {experiment.flagName} / {experiment.ruleName}
        </Text>
        <Badge intent={experiment.live ? 'success' : 'neutral'} variant="subtle">
          {experiment.live ? 'Running' : experiment.status}
        </Badge>
      </Group>
      <Text color="fg.secondary" fontSize="xs">
        {TYPE_LABELS[experiment.type] ?? experiment.type} · {experiment.trafficPercent}% of traffic · on{' '}
        <code>{experiment.route || 'every route'}</code>
        {experiment.variations.length > 0 ? ` · ${experiment.variations.join(' / ')}` : ''}
      </Text>
      {results ? (
        <>
          <Text color="fg.secondary" fontSize="xs">
            {results.metric}
          </Text>
          <table style={{borderCollapse: 'collapse', fontSize: 12, width: '100%'}}>
            <thead>
              <tr>
                <th style={{textAlign: 'left', fontWeight: 600}}>Variation</th>
                <th style={{textAlign: 'right', fontWeight: 600}}>Visitors</th>
                <th style={{textAlign: 'right', fontWeight: 600}}>Rate</th>
                <th style={{textAlign: 'right', fontWeight: 600}}>Lift</th>
              </tr>
            </thead>
            <tbody>
              {results.variations.map((v) => (
                <tr key={v.name}>
                  <td>{v.isBaseline ? `${v.name} (baseline)` : v.name}</td>
                  <td style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>{compact(v.samples)}</td>
                  <td style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
                    {v.rate === null ? '-' : percent(v.rate)}
                  </td>
                  <td style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
                    {v.lift === null ? '-' : `${v.lift > 0 ? '+' : ''}${percent(v.lift)}${v.significant ? ' ✓' : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Text color="fg.tertiary" fontSize="xs">
            {'✓'} = statistically significant.
            {results.lastCalculated ? ` Calculated ${new Date(results.lastCalculated).toLocaleString()}.` : ''}
          </Text>
        </>
      ) : (
        <Text color="fg.tertiary" fontSize="xs">
          {experiment.resultsError}
        </Text>
      )}
      <Group gap="8">
        {experiment.resultsUrl && (
          <OpenLink appearance="subtle" size="sm" url={experiment.resultsUrl}>
            Results in FX
          </OpenLink>
        )}
        <OpenLink appearance="subtle" size="sm" url={experiment.flagUrl}>
          Open flag
        </OpenLink>
      </Group>
    </Group>
  );
}

function Performance({context}: {context: ExtensionContext}) {
  const content = useContent(context);
  const [result, setResult] = useState<PerformanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (path: string, locale: string) => {
      const id = ++requestId.current;
      setBusy(true);
      try {
        const next = await call(context, 'performance', {path, locale});
        if (id !== requestId.current) return;
        setResult(next);
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
    if (content?.path) void load(content.path, content.locale);
    else setResult(null);
  }, [content?.path, content?.locale, load]);

  if (!content) return <Frame busy title="Page performance" />;
  const report = result?.ga4.ok ? result.ga4.report : null;

  return (
    <Frame
      busy={busy}
      error={error}
      subtitle={content.path ? `Last 28 days for ${content.path}, all locales of this URL included.` : undefined}
      title="Page performance"
    >
      <style>{CHART_STYLE}</style>
      {!content.path ? (
        <NeedsPage />
      ) : (
        // Refetch keeps the frame: the previous render stays, dimmed, until new data lands.
        <div className="viz-root" style={{opacity: busy && result ? 0.6 : 1, transition: 'opacity 120ms'}}>
          <Group flexDirection="column" gap="12">
            {result && !result.ga4.ok && (
              <Alert intent="information">
                <Text fontSize="sm">{result.ga4.error}</Text>
              </Alert>
            )}
            {report && (
              <>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12}}>
                  <StatTile label="Page views" previous={report.previous.views} value={report.totals.views} />
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

                <Text fontSize="sm" fontWeight="600">Page views per day</Text>
                {report.totals.views === 0 ? (
                  <Text color="fg.secondary" fontSize="sm">
                    No views in GA4 for this page in the last 28 days.
                  </Text>
                ) : (
                  <TrendChart points={report.daily} />
                )}

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
                      rows={report.variants.map((v) => ({label: v.variant === 'base' ? 'Base page' : v.variant, value: v.views}))}
                      unit="views"
                    />
                  </>
                )}
                <Text color="fg.tertiary" fontSize="xs">
                  FX variations are served on the same URL, so GA4 cannot split them - see the experiment results below.
                </Text>
              </>
            )}

            <Separator />
            <Text fontSize="sm" fontWeight="600">Experiments on this page</Text>
            {result && !result.fxConfigured && (
              <Alert intent="information">
                <Text fontSize="sm">Add an FX token and project in the app settings to see experiments.</Text>
              </Alert>
            )}
            {result?.experimentsError && (
              <Alert intent="danger">
                <Text fontSize="sm">{result.experimentsError}</Text>
              </Alert>
            )}
            {result?.fxConfigured && !result.experimentsError && result.experiments.length === 0 && (
              <Text color="fg.secondary" fontSize="sm">
                No A/B test in {result.environmentKey} targets this page: no CMS flag (cms_flag on) has a cms_route
                covering {result.path}.
              </Text>
            )}
            {result?.experiments.map((e) => (
              <Experiment experiment={e} key={`${e.flagKey}:${e.ruleKey}`} />
            ))}
            {result && (
              <Button appearance="subtle" onClick={() => void load(content.path!, content.locale)} size="sm">
                Refresh
              </Button>
            )}
          </Group>
        </div>
      )}
    </Frame>
  );
}

register((context) => <Performance context={context} />);
