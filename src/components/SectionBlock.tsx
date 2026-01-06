const  SectionBlock = ({
  heading,
  children,
  contentClasses,
}: {
  heading: string;
  children: any;
  contentClasses?: string;
}) => {
  return (
    <div className="flex flex-wrap justify-between items-center xl:flex-nowrap">
      <div
        className="
          w-full
          font-bold
          xl:w-48
        "
      >
        {heading}
      </div>
      <div
        className={`
        ml-4
        mt-4
        w-full
        text-sm

        xl:ml-0

        xl:mt-0
        xl:w-auto

        xl:flex-1
        xl:text-base
        ${contentClasses ? contentClasses : ""}
      `}
      >
        {children}
      </div>
    </div>
  );
};

export default SectionBlock;