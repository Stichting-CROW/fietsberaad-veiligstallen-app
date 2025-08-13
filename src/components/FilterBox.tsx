// import { useState } from "react";
// import { FiFilter } from "react-icons/fi";
import { useSession } from "next-auth/react";
// import { AiFillMinusCircle, AiFillPlusCircle } from "react-icons/ai";
import FilterBoxList, {
  updateActiveTypeStates,
} from "~/components/FilterBoxList";
// import FilterBoxPrice, {
//   updateActivePriceStates,
// } from "~/components/FilterBoxPrice";
import { useDispatch, useSelector } from "react-redux";

import { type AppState } from "~/store/store";
import { toggleType, toggleType2 } from "~/store/filterSlice";
import { toggleType as toggleTypeArticles } from "~/store/filterArticlesSlice";

export const FILTERBOX_OPTIONS = [
  {
    id: "bewaakt",
    name: "bewaakt",
    title: "Bewaakte stalling",
    active: true
  },
  {
    id: "geautomatiseerd",
    name: "geautomatiseerd",
    title: "Geautomatiseerde stalling",
    active: true,
  },
  {
    id: "toezicht",
    name: "toezicht",
    title: "Stalling met toezicht",
    active: true,
  },
  {
    id: "onbewaakt",
    name: "publiek",
    title: "Onbewaakte stalling",
    active: false,
  },
  {
    id: "buurtstalling",
    name: "buurtstalling",
    title: "Buurtstalling",
    active: false,
  },
  {
    id: "fietstrommel",
    name: "fietstrommel",
    title: "Fietsentrommel",
    active: false,
  },
  {
    id: "fietskluizen",
    name: "fietskluizen",
    title: "Fietskluis",
    active: false,
  },
];

// const FILTERBOX_OPTIONS_PRICE = [
//   { id: "per_uur", title: "Per uur", active: true },
//   { id: "per_dag", title: "Per dag", active: true },
//   { id: "jaarabonnement", title: "Jaarabonnement", active: true },
// ];

const FILTERBOX_OPTIONS_SUBMISSIONS = [
  {
    id: "show_submissions",
    name: "show_submissions",
    title: "Toon aanmeldingen",
    active: false,
  },
];

type FilterBoxProps = {
  filterArticles: boolean;
  // showMeerFiltersVisible: boolean;
  showFilterAanmeldingen: boolean;
};

const FilterBox: React.FC<FilterBoxProps> = ({
  filterArticles,
  showFilterAanmeldingen = false,
}:FilterBoxProps) => {
  const isOpen = false;
  const dispatch = useDispatch();
  const { data: session } = useSession()

  // TODO: prijsfilter werkt nog niet
  //  const [alleFilters, setAlleFilters] = useState(false); 

  const activeTypes = useSelector(
    (state: AppState) => state.filter.activeTypes
  );

  const activeTypesArticles = useSelector(
    (state: AppState) => state.filter.activeTypesArticles
  );

  const toggleFilterTypes = (optionId: string) => {
    if(filterArticles===false) {  
      dispatch(toggleType({ pfType: optionId }));
    } else {
      dispatch(toggleTypeArticles({ pfType: optionId }));
    }
  };

  const activeAanmeldingen = useSelector(
    (state: AppState) => state.filter.activeTypes2
  );

  const toggleFilterAanmeldingen = (optionId: string) => {
    dispatch(toggleType2({ pfType: optionId }));
  };

  const options_type_with_state = updateActiveTypeStates(FILTERBOX_OPTIONS, filterArticles ? activeTypesArticles : activeTypes);
  // const filterbox_options_price_with_state = updateActivePriceStates(FILTERBOX_OPTIONS_PRICE, []);
  const options_aanmeldingen_with_state = updateActiveTypeStates(FILTERBOX_OPTIONS_SUBMISSIONS, filterArticles ? []: activeAanmeldingen);

  return (
    <div
      className={`h-auto rounded-xl border-t border-gray-200 bg-white transition-all duration-300 ease-in-out ${filterArticles ? "border-2 border-red-500" : ""}`}
    >
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div
          className={`
          ${isOpen ? "flex justify-between" : ""}
        `}
        >
          <div className={``}>
            <FilterBoxList
              title={``}
              options={options_type_with_state}
              onToggleFilter={toggleFilterTypes}
            />
          </div>
        </div>

        {/* <div className={`${alleFilters ? "" : "hidden"}`}>
          <FilterBoxPrice
            title="Prijs"
            options={filterbox_options_price_with_state}
            onToggleFilter={toggleFilterTypes}
          />
        </div> */}

        {showFilterAanmeldingen && !filterArticles ?
          <div className="mt-5">
            <FilterBoxList
              title=''
              options={options_aanmeldingen_with_state}
              onToggleFilter={toggleFilterAanmeldingen}
            />
          </div> : null}

        {/* <div className={`${showMeerFiltersVisible ? "" : "hidden"}`}>
          <button
            className={`
              flex
              rounded-md
              bg-black
              px-3
              py-1
              text-white
            `}
            onClick={() => {
              setAlleFilters(!alleFilters);
            }}
            aria-expanded={alleFilters}
          >
            {alleFilters && (
              <>
                <div className="mr-2 flex h-full flex-col justify-center">
                  <AiFillMinusCircle size={20} color="white" />
                </div>
                Minder filters
              </>
            )}

            {!alleFilters && (
              <>
                <div className="mr-2 flex h-full flex-col justify-center">
                  <AiFillPlusCircle size={20} color="white" />
                </div>
                Meer filters
              </>
            )}
          </button>
        </div> */}
      </div>
    </div>
  );
};

export default FilterBox;
