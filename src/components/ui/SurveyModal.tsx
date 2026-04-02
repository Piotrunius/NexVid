'use client';

import { cloudFetch } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from './Toaster';

interface SurveyQuestion {
  id: string;
  type: 'rating' | 'single' | 'multiple' | 'text';
  text: string;
  options?: string[];
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

const HIDE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

export function SurveyModal() {
  const pathname = usePathname();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only allowed on exact homepage, never on /watch or other pages
  const isHomepage = pathname === '/' || pathname === '';

  useEffect(() => {
    if (!isHomepage) {
      if (isVisible) setIsVisible(false);
      return;
    }

    const checkSurvey = async () => {
      try {
        const activeRes = await cloudFetch<{ survey: any }>('/public/survey');
        if (!activeRes.survey) return;

        const surveyData = activeRes.survey;
        // Ensure questions are parsed
        if (typeof surveyData.questions === 'string') {
          surveyData.questions = JSON.parse(surveyData.questions);
        }

        const surveyId = surveyData.id;
        const lastClosed = localStorage.getItem(`survey_hide_${surveyId}`);
        const isCompleted = localStorage.getItem(`survey_Completed_${surveyId}`);

        if (isCompleted) return;
        if (lastClosed && Date.now() - parseInt(lastClosed) < HIDE_DURATION_MS) return;

        setSurvey(surveyData);
        setIsVisible(true);
      } catch (err) {
        console.error('Survey fetch error:', err);
      }
    };

    checkSurvey();
  }, []);

  const handleClose = (temporary = true) => {
    if (temporary && survey) {
      localStorage.setItem(`survey_hide_${survey.id}`, Date.now().toString());
    }
    setIsVisible(false);
  };

  const handleNext = () => {
    if (!survey) return;
    if (step < survey.questions.length - 1) {
      setStep(step + 1);
    } else {
      submitSurvey();
    }
  };

  const handleSkip = () => {
    if (!survey || survey.questions.length <= 1) return;
    if (step < survey.questions.length - 1) {
      setStep(step + 1);
      return;
    }

    submitSurvey();
  };

  const submitSurvey = async () => {
    if (!survey) return;
    setIsSubmitting(true);
    try {
      await cloudFetch('/public/survey/respond', {
        method: 'POST',
        body: JSON.stringify({
          surveyId: survey.id,
          answers,
        }),
      });
      localStorage.setItem(`survey_Completed_${survey.id}`, 'true');
      toast('Thank you for your feedback!', 'success');
      setIsVisible(false);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentQuestion = survey?.questions[step];

  const hasCurrentAnswer = (() => {
    if (!currentQuestion) return false;
    const currentAnswer = answers[currentQuestion.id];

    if (currentQuestion.type === 'multiple') {
      return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    }

    if (currentQuestion.type === 'text') {
      return typeof currentAnswer === 'string' && currentAnswer.trim().length > 0;
    }

    return currentAnswer !== undefined && currentAnswer !== null && currentAnswer !== '';
  })();

  const updateAnswer = (val: any) => {
    if (!currentQuestion) return;
    setAnswers({ ...answers, [currentQuestion.id]: val });
  };

  const { glassEffect } = useSettingsStore((s) => s.settings);

  if (!isVisible || !survey || !currentQuestion) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-fade-in">
      <div className={cn(
        "glass-card w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 shadow-[0_32px_128px_rgba(0,0,0,0.9)] animate-scale-in",
        glassEffect && "glass-liquid"
      )}>
        <div className="p-8 text-center">
          <button onClick={() => handleClose(true)} className="absolute right-4 top-4 text-white/30 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>

          <h2 className="mb-3 text-[22px] font-black tracking-tight text-white">{survey.title}</h2>
          {survey.description && <p className="mb-8 text-[13px] leading-relaxed text-white/60">{survey.description}</p>}

          <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between gap-2 px-2">
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Question {step + 1} of {survey.questions.length}</span>
              <div className="flex gap-1">
                {survey.questions.map((_, i) => (
                  <div key={i} className={cn("h-1 w-4 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-white/10")} />
                ))}
              </div>
            </div>
            <p className="text-center text-[15px] font-medium text-white/80 leading-tight">{currentQuestion.text}</p>
          </div>

          <div className="my-8 min-h-[160px]">
            {currentQuestion.type === 'rating' && (
              <div className="flex justify-center gap-2 py-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => updateAnswer(star)}
                    className={cn(
                      "group p-1 transition-transform active:scale-90",
                      (answers[currentQuestion.id] || 0) >= star ? "text-amber-400" : "text-white/10 hover:text-white/30"
                    )}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="drop-shadow-lg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.type === 'single' && (
              <div className="space-y-2">
                {currentQuestion.options?.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => updateAnswer(opt)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left text-[13px] font-medium transition-all",
                      answers[currentQuestion.id] === opt ? "border-accent bg-accent/10 text-accent" : "border-white/5 bg-white/5 text-white/60 hover:bg-white/10"
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.type === 'multiple' && (
              <div className="space-y-2">
                {currentQuestion.options?.map((opt) => {
                  const currentList = answers[currentQuestion.id] || [];
                  const isSelected = currentList.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const next = isSelected ? currentList.filter((i: any) => i !== opt) : [...currentList, opt];
                        updateAnswer(next);
                      }}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left text-[13px] font-medium transition-all",
                        isSelected ? "border-accent bg-accent/10 text-accent" : "border-white/5 bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{opt}</span>
                        {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQuestion.type === 'text' && (
              <textarea
                className="input min-h-[120px] w-full text-[13px]"
                placeholder="Write your answer here..."
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => updateAnswer(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-3">
            <button
              disabled={isSubmitting || !hasCurrentAnswer}
              onClick={handleNext}
              className="btn-accent flex w-full items-center justify-center py-4 font-bold uppercase tracking-widest shadow-[0_8px_24px_rgba(var(--accent-rgb),0.3)]"
            >
              {isSubmitting ? 'Sending...' : step < survey.questions.length - 1 ? 'Answer' : 'Submit'}
            </button>
            <div className="flex gap-3">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="btn-glass flex-1 flex items-center justify-center py-4 text-[13px] font-bold">Back</button>
              )}
              {survey.questions.length > 1 && (
                <button onClick={handleSkip} className="btn-glass flex-1 flex items-center justify-center py-4 text-[13px] font-bold">
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
