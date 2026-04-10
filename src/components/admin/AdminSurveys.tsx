'use client';

import { toast } from '@/components/ui/Toaster';
import { cloudFetch } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { Circle, ListChecks, Star, Type } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type QuestionType = 'rating' | 'single' | 'multiple' | 'text';

interface SurveyQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  is_active: number;
  is_archived: number;
  created_at: string;
}

interface SurveyResponse {
  id: number;
  survey_id: string;
  user_id: string | null;
  answers: string;
  created_at: string;
}

export function AdminSurveys({ canDelete }: { canDelete: boolean }) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newQuestions, setNewQuestions] = useState<SurveyQuestion[]>([]);

  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const loadSurveys = async () => {
    try {
      const res = await cloudFetch<{ surveys: any[] }>('/admin/surveys');
      const mapped = res.surveys.map(s => ({
        ...s,
        questions: typeof s.questions === 'string' ? JSON.parse(s.questions) : s.questions
      }));
      setSurveys(mapped);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSurveys();
  }, []);

  const sortedSurveys = useMemo(() => {
    return [...surveys].sort((a, b) => {
      if (a.is_active !== b.is_active) return b.is_active - a.is_active;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [surveys]);

  const visibleSurveys = useMemo(() => {
    return sortedSurveys.filter((survey) => showArchived ? survey.is_archived === 1 : survey.is_archived !== 1);
  }, [showArchived, sortedSurveys]);

  const addQuestion = (type: QuestionType) => {
    const q: SurveyQuestion = {
      id: Math.random().toString(36).substring(7),
      type,
      text: '',
      options: type === 'single' || type === 'multiple' ? [''] : undefined,
    };
    setNewQuestions([...newQuestions, q]);
  };

  const prepareQuestions = (): { ok: true; questions: SurveyQuestion[] } | { ok: false; error: string } => {
    if (!newTitle.trim()) {
      return { ok: false, error: 'Title is required' };
    }

    if (newTitle.trim().length > 120) {
      return { ok: false, error: 'Title is too long' };
    }

    if (newQuestions.length === 0) {
      return { ok: false, error: 'Add at least one question' };
    }

    if (newQuestions.length > 12) {
      return { ok: false, error: 'Too many questions (max 12)' };
    }

    const seenIds = new Set<string>();
    const cleanedQuestions: SurveyQuestion[] = [];

    for (const question of newQuestions) {
      const id = question.id.trim();
      const text = question.text.trim();

      if (!id || seenIds.has(id)) {
        return { ok: false, error: 'Question ids must be unique' };
      }
      if (!text) {
        return { ok: false, error: 'Every question needs text' };
      }

      seenIds.add(id);

      const nextQuestion: SurveyQuestion = { ...question, id, text };

      if (question.type === 'single' || question.type === 'multiple') {
        const options = (question.options || []).map((opt) => opt.trim()).filter(Boolean);
        const uniqueOptions = new Set(options.map((opt) => opt.toLowerCase()));

        if (options.length < 2) {
          return { ok: false, error: 'Choice questions need at least two options' };
        }
        if (uniqueOptions.size !== options.length) {
          return { ok: false, error: 'Choice options must be unique' };
        }

        nextQuestion.options = options;
      } else {
        delete nextQuestion.options;
      }

      cleanedQuestions.push(nextQuestion);
    }

    return { ok: true, questions: cleanedQuestions };
  };

  const handleCreate = async () => {
    const prepared = prepareQuestions();
    if (!prepared.ok) {
      toast(prepared.error, 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await cloudFetch('/admin/surveys', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc,
          questions: prepared.questions,
        }),
      });
      toast('Survey created', 'success');
      setNewTitle('');
      setNewDesc('');
      setNewQuestions([]);
      loadSurveys();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSurvey = async (id: string, currentActive: boolean) => {
    try {
      await cloudFetch('/admin/surveys', {
        method: 'PATCH',
        body: JSON.stringify({ id, isActive: !currentActive }),
      });
      loadSurveys();
      toast(!currentActive ? 'Survey activated' : 'Survey deactivated', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const deleteSurvey = async (id: string) => {
    if (!confirm('Delete this survey and all its responses?')) return;
    try {
      await cloudFetch(`/admin/surveys?id=${id}`, { method: 'DELETE' });
      loadSurveys();
      if (viewingResults === id) setViewingResults(null);
      toast('Survey deleted', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const setSurveyArchived = async (id: string, archive: boolean) => {
    try {
      await cloudFetch('/admin/surveys', {
        method: 'PATCH',
        body: JSON.stringify({ id, isArchived: archive }),
      });

      if (archive && viewingResults === id) {
        setViewingResults(null);
      }

      await loadSurveys();
      toast(archive ? 'Survey archived' : 'Survey restored', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const selectResults = async (id: string) => {
    if (viewingResults === id) {
      setViewingResults(null);
      return;
    }
    setViewingResults(id);
    setResponses([]);
    try {
      const res = await cloudFetch<{ responses: SurveyResponse[] }>(`/admin/surveys/results?id=${id}`);
      setResponses(res.responses);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const getAnalytics = (surveyId: string) => {
    const survey = surveys.find(s => s.id === surveyId);
    if (!survey) return null;

    const stats: Record<string, any> = {};
    survey.questions.forEach(q => {
      stats[q.id] = { text: q.text, type: q.type, data: {} };
    });

    responses.forEach(r => {
      try {
        const answers = JSON.parse(r.answers);
        Object.entries(answers).forEach(([qId, val]: [string, any]) => {
          if (!stats[qId]) return;
          const qStat = stats[qId];
          if (qStat.type === 'multiple' && Array.isArray(val)) {
            val.forEach(v => { qStat.data[v] = (qStat.data[v] || 0) + 1; });
          } else if (qStat.type === 'text') {
            if (!qStat.data.list) qStat.data.list = [];
            qStat.data.list.push(val);
          } else {
            qStat.data[val] = (qStat.data[val] || 0) + 1;
          }
        });
      } catch {}
    });
    return stats;
  };

  if (isLoading) return <div className="p-8 text-center text-white/50">Loading surveys...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Survey List */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Manage Surveys</h2>
            <button
              onClick={() => setShowArchived((prev) => !prev)}
              className={cn('btn-glass text-[10px] px-3 py-1.5 uppercase tracking-wider', showArchived && 'bg-accent/15 text-accent')}
            >
              {showArchived ? 'Show Active' : 'Show Archived'}
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-6 scroll-row -mx-1 px-1 items-start">
            {visibleSurveys.map(s => (
              <div key={s.id} className={cn(
                "rounded-[18px] bg-white/[0.03] border p-4 flex flex-col justify-between gap-4 w-[260px] shrink-0 transition-all duration-300",
                s.is_active ? "!border-accent/40 shadow-lg" : s.is_archived ? "border-yellow-500/20 shadow-lg" : "border-white/5 shadow-lg"
              )}>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-white text-[14px] truncate">{s.title}</h3>
                    <div className="flex items-center gap-1.5">
                      {s.is_active === 1 && (
                        <span className="text-[8px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1 border border-accent/30">
                          Active
                        </span>
                      )}
                      {s.is_archived === 1 && (
                        <span className="text-[8px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full font-black uppercase flex items-center gap-1 border border-yellow-500/30">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-white/40 line-clamp-1">{s.description || 'No description'}</p>
                  <p className="text-[9px] text-white/20 mt-2 font-medium">{new Date(s.created_at).toLocaleDateString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={s.is_archived === 1}
                      onClick={() => toggleSurvey(s.id, s.is_active === 1)}
                      className={cn(
                        "btn-glass text-[11px] py-2.5 px-3 font-semibold",
                        s.is_active === 1 ? "bg-white/10" : "bg-white/5",
                        s.is_archived === 1 && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                    {s.is_active === 1 ? 'Stop' : 'Start'}
                  </button>
                  <button
                    onClick={() => selectResults(s.id)}
                    className={cn("btn-glass text-[11px] py-2.5 px-3 font-semibold", viewingResults === s.id && "bg-accent/20 text-accent")}
                  >
                    Stats
                  </button>
                  <button
                    onClick={() => setSurveyArchived(s.id, s.is_archived !== 1)}
                    className={cn(
                      'btn-glass text-[11px] py-2.5 px-3 font-semibold',
                      canDelete ? 'col-span-1' : 'col-span-2',
                      s.is_archived === 1 ? 'text-emerald-300/90 bg-emerald-500/10' : 'text-yellow-300/90 bg-yellow-500/10'
                    )}
                    title={s.is_archived === 1 ? 'Restore survey' : 'Archive survey'}
                  >
                    {s.is_archived === 1 ? 'Restore' : 'Archive'}
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => deleteSurvey(s.id)}
                      className="btn-glass text-[11px] py-2.5 px-3 font-semibold text-red-300/90 bg-red-500/10"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {visibleSurveys.length === 0 && <div className="w-full p-12 text-center text-white/10 border border-dashed border-white/5 rounded-2xl">{showArchived ? 'No archived surveys' : 'No active surveys'}</div>}
          </div>

          {/* Results Panel (Separate at the bottom) */}
          {viewingResults && (
            <div className="glass-card p-4 animate-slide-up border-white/10 shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[14px] font-bold text-white">Results: {surveys.find(s => s.id === viewingResults)?.title}</h3>
                  <p className="text-[10px] text-white/40">{responses.length} responses</p>
                </div>
                <button onClick={() => setViewingResults(null)} className="text-white/30 hover:text-white transition-colors p-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="space-y-4">
                {Object.entries(getAnalytics(viewingResults) || {}).map(([id, stat]: [string, any]) => (
                  <div key={id} className="space-y-3 bg-white/[0.02] p-5 rounded-2xl border border-white/5 shadow-sm w-full">
                    <p className="text-[14px] font-bold text-white/90 leading-tight" title={stat.text}>{stat.text}</p>
                    {stat.type === 'text' ? (
                      <div className="space-y-2 max-h-64 overflow-auto pr-2 custom-scrollbar">
                        {stat.data.list?.map((t: string, i: number) => (
                          <div key={i} className="p-3 rounded-xl bg-white/5 text-[12px] text-white/60 border border-white/5">{t}</div>
                        ))}
                        {!stat.data.list?.length && <p className="text-[11px] text-white/20 italic py-4 text-center">No responses yet</p>}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(stat.data).sort((a:any, b:any) => b[1] - a[1]).map(([label, count]: [string, any]) => {
                          const percent = Math.round((count / responses.length) * 100) || 0;
                          return (
                            <div key={label} className="space-y-2">
                              <div className="flex justify-between text-[11px] uppercase font-black tracking-widest mb-1">
                                <span className="text-white/40 flex-1 mr-8">{label}</span>
                                <span className="text-accent shrink-0">{count} ({percent}%)</span>
                              </div>
                              <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-accent shadow-[0_0_12px_var(--accent-glow)] transition-all duration-1000" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {Object.keys(stat.data).length === 0 && <p className="text-[11px] text-white/20 italic py-2 text-center">No responses yet</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create Survey */}
        <div className="glass-card p-5 space-y-4 h-fit sticky top-24 border-white/10 shadow-xl">
          <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
            New Survey
          </h2>
          <div className="space-y-3">
            <input className="input w-full bg-white/5 border-white/5" placeholder="Title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <textarea className="input w-full min-h-[60px] text-[13px] bg-white/5 border-white/5" placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Questions</p>
            <div className="space-y-3 max-h-[40vh] overflow-auto pr-1 custom-scrollbar">
              {newQuestions.map((q, idx) => (
                <div key={q.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-accent uppercase tracking-tighter">{q.type} #{idx+1}</span>
                    <button onClick={() => setNewQuestions(newQuestions.filter((_, i) => i !== idx))} className="text-white/20 hover:text-red-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <input className="input-minimal w-full text-[13px]" placeholder="Question text..." value={q.text} onChange={e => {
                    const qs = [...newQuestions];
                    qs[idx].text = e.target.value;
                    setNewQuestions(qs);
                  }} />
                  {(q.type === 'single' || q.type === 'multiple') && (
                    <div className="space-y-1.5 pl-2 border-l border-white/10 mt-1">
                      {q.options?.map((opt, oIdx) => (
                        <div key={oIdx} className="flex gap-2">
                          <input className="input-minimal flex-1 text-[11px]" placeholder={`Option ${oIdx+1}`} value={opt} onChange={e => {
                            const qs = [...newQuestions];
                            qs[idx].options![oIdx] = e.target.value;
                            setNewQuestions(qs);
                          }} />
                          <button onClick={() => {
                            const qs = [...newQuestions];
                            qs[idx].options = qs[idx].options!.filter((_, i) => i !== oIdx);
                            setNewQuestions(qs);
                          }} className="text-white/20 hover:text-white/50">×</button>
                        </div>
                      ))}
                      <button onClick={() => {
                        const qs = [...newQuestions];
                        qs[idx].options!.push('');
                        setNewQuestions(qs);
                      }} className="text-[10px] text-accent/60 font-black uppercase">+ Add</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => addQuestion('rating')} className="btn-glass flex items-center justify-center gap-1.5 text-[10px] py-2 bg-white/5">
                <Star size={12} />
                Rating
              </button>
              <button onClick={() => addQuestion('single')} className="btn-glass flex items-center justify-center gap-1.5 text-[10px] py-2 bg-white/5">
                <Circle size={12} />
                Single
              </button>
              <button onClick={() => addQuestion('multiple')} className="btn-glass flex items-center justify-center gap-1.5 text-[10px] py-2 bg-white/5">
                <ListChecks size={12} />
                Multiple
              </button>
              <button onClick={() => addQuestion('text')} className="btn-glass flex items-center justify-center gap-1.5 text-[10px] py-2 bg-white/5">
                <Type size={12} />
                Text
              </button>
            </div>
          </div>

          <button
            disabled={isSubmitting || !newTitle.trim() || newQuestions.length === 0}
            onClick={handleCreate}
            className="btn-accent w-full py-3 mt-2 font-bold tracking-widest text-[11px]"
          >
            {isSubmitting ? 'Creating...' : 'Launch Survey'}
          </button>
        </div>
      </div>
    </div>
  );
}
