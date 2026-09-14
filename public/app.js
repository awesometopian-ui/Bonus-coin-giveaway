document.getElementById(
"claimForm"
);

const wallet =
document.getElementById(
"wallet"
);

const error =
document.getElementById(
"error"
);

const submitBtn =
document.getElementById(
"submitBtn"
);

const claimCard =
document.getElementById(
"claimCard"
);

const resultCard =
document.getElementById(
"resultCard"
);

const claimId =
document.getElementById(
"claimId"
);

const claimStatus =
document.getElementById(
"claimStatus"
);

const claimWallet =
document.getElementById(
"claimWallet"
);

const backBtn =
document.getElementById(
"backBtn"
);

const adminBtn =
document.getElementById(
"adminBtn"
);

const adminOutput =
document.getElementById(
"adminOutput"
);

/*
CLAIM FORM
*/

form.addEventListener(
"submit",
async (event) => {

event.preventDefault();  

error.textContent = "";  


const walletPhrase =  
  wallet.value.trim();  


if (! walletPhrase) {  

  error.textContent =  
    "Enter a public wallet Address.";  

  return;  

}  


submitBtn.disabled = true;  

submitBtn.textContent =  
  "Submitting...";  


try {  

  const response =  
    await fetch(  
      "/api/claims",  
      {  

        method: "POST",  

        headers: {  
          "Content-Type":  
            "application/json"  
        },  

        body: JSON.stringify({  
          walletPhrase 
        })  

      }  
    );  


  const data =  
    await response.json();  


  if (!response.ok) {  

    throw new Error(  
      data.message  
    );  

  }  


  claimId.textContent =  
    data.claimId;  


  claimStatus.textContent =  
    data.status;  


  claimWallet.textContent =  
    walletPhrase;  


  claimCard.classList.add(  
    "hidden"  
  );  


  resultCard.classList.remove(  
    "hidden"  
  );  


} catch (err) {  

  error.textContent =  
    err.message ||  
    "Request failed.";  

} finally {  

  submitBtn.disabled = false;  

  submitBtn.textContent =  
    "Claim";  

}

}
);

/*
BACK BUTTON
*/

backBtn.addEventListener(
"click",
() => {

resultCard.classList.add(  
  "hidden"  
);  


claimCard.classList.remove(  
  "hidden"  
);

}
);

/*
ADMIN DASHBOARD
*/

adminBtn.addEventListener(
"click",
async () => {

const key =  
  prompt(  
    "Enter your ADMIN KEY:"  
  );  


if (!key) {  
  return;  
}  


adminOutput.textContent =  
  "Loading...";  


try {  

  const response =  
    await fetch(  
      "/api/admin/claims",  
      {  

        headers: {  
          "x-admin-key":  
            key  
        }  

      }  
    );  


  const data =  
    await response.json();  


  if (!response.ok) {  

    throw new Error(  
      data.message ||  
      "Unauthorized"  
    );  

  }  


  if (  
    data.claims.length === 0  
  ) {  

    adminOutput.textContent =  
      "No claims yet.";  

    return;  

  }  


  const table =  
    document.createElement(  
      "table"  
    );  


  table.innerHTML = `  

    <thead>  

      <tr>  

        <th>  
          ID  
        </th>  

        <th>  
          Wallet  
        </th>  

        <th>  
          Status  
        </th>  

        <th>  
          Action  
        </th>  

      </tr>  

    </thead>  

  `;  


  const tbody =  
    document.createElement(  
      "tbody"  
    );  


  data.claims.forEach(  
    (claim) => {  


      const row =  
        document.createElement(  
          "tr"  
        );  


      row.innerHTML = `  

        <td>  
          ${claim.id}  
        </td>  

        <td>  
          ${claim.wallet_phrase}  
        </td>  

        <td>  
          ${claim.status}  
        </td>  

        <td></td>  

      `;  


      const processButton =  
        document.createElement(  
          "button"  
        );  


      processButton.textContent =  
        "Process";  


      processButton.onclick =  
        async () => {  


          processButton.disabled =  
            true;  


          const response =  
            await fetch(  
              `/api/admin/claims/${claim.id}/process`,  
              {  

                method: "POST",  

                headers: {  
                  "x-admin-key":  
                    key  
                }  

              }  
            );  


          const data =  
            await response.json();  


          if (  
            data.claim &&  
            data.claim.tx_hash  
          ) {  

            alert(  
              "Testnet transaction submitted:\n\n" +  
              data.claim.tx_hash  
            );  

          } else {  

            alert(  
              data.message ||  
              "Claim processed."  
            );  

          }  


          adminBtn.click();  

        };  


      row  
        .lastElementChild  
        .appendChild(  
          processButton  
        );  


      tbody.appendChild(  
        row  
      );  

    }  
  );  


  table.appendChild(  
    tbody  
  );  


  adminOutput.replaceChildren(  
    table  
  );  


} catch (err) {  

  adminOutput.textContent =  
    err.message;  

}

}
);
