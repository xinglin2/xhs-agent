'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  currentStep: 1 | 2 | 3;
}

const steps = [
  { n: 1, label: '创作' },
  { n: 2, label: '图片' },
  { n: 3, label: '发布' },
];

export function StepIndicator({ currentStep }: Props) {
  return (
    <div className="flex items-center w-full">
      {steps.map((step, index) => {
        const isCompleted = step.n < currentStep;
        const isActive = step.n === currentStep;
        const isUpcoming = step.n > currentStep;

        return (
          <div key={step.n} className="flex items-center flex-1 last:flex-none">
            {/* Circle + Label */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-200',
                  isCompleted && 'bg-[#FF2442] border-[#FF2442] text-white',
                  isActive && 'bg-[#FF2442] border-[#FF2442] text-white shadow-md',
                  isUpcoming && 'bg-white border-gray-300 text-gray-400',
                )}
              >
                {isCompleted ? <Check size={16} strokeWidth={3} /> : step.n}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  (isActive || isCompleted) ? 'text-[#FF2442]' : 'text-gray-400',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {index < steps.length - 1 && (
              <div className="flex-1 mx-2 mb-4">
                <div
                  className={cn(
                    'h-0.5 rounded-full transition-all duration-300',
                    isCompleted ? 'bg-[#FF2442]' : 'bg-gray-200',
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
