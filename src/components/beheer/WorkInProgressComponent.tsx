import React from 'react';

interface WorkInProgressProps {
    title?: string;
}

const WorkInProgressComponent: React.FC<WorkInProgressProps> = ({ title = "Werk in uitvoering" }) => {
    return (
        <div className="flex flex-col items-center justify-center p-4">
            <img 
                src="/images/werk-in-uitvoering.webp" 
                alt="Work in Progress"
                className="max-w-full h-auto"
                width={400}
                height={300}
            />
            <div className="text-4xl font-bold text-gray-700">{title}</div>
            </div>
    );
};

export default WorkInProgressComponent;
